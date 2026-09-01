"""Five-stage composition for compiled paid API media nodes."""

from __future__ import annotations

import base64
import inspect
import json
import time
from collections.abc import Mapping

import torch

from ..auth_provider_key import ProviderKeyStore
from ..cache_semantic import credential_fingerprint, semantic_key
from ..errors_taxonomy import (
    EmptyOrMalformedSuccessError,
    IndeterminateSubmitError,
    LocalValidationError,
)
from ..media_image_in import (
    ImageLimits,
    LocalImagePlan,
    ReferenceSet,
    UploadCache,
    content_hash,
    encode_frame,
)
from ..media_image_in import prepare_image_inputs
from ..media_image_out import DownloadStream, image_from_result
from ..poll_task import poll_task
from ..route_multi import build_route_payload, route_projection
from ..spend_admission import DryRun, RunLedger, admit
from ..submit_billable import submit_billable
from ..submit_sync import submit_sync
from ..transport_http import HttpResponse, request as http_request
from ..ui_progress import make_progress_callback


_MISSING = object()
_LEDGER = RunLedger()
_UPLOAD_CACHE = UploadCache()
_RUNTIME_KEY = "__flow_runtime__"


def _get(runtime, name, default=_MISSING):
    if isinstance(runtime, Mapping):
        value = runtime.get(name, _MISSING)
    else:
        value = getattr(runtime, name, _MISSING)
    if value is _MISSING:
        if default is _MISSING:
            raise LocalValidationError(f"compiled runtime is missing {name!r}")
        return default
    return value


async def _call(function, *args, **kwargs):
    value = function(*args, **kwargs)
    return await value if inspect.isawaitable(value) else value


class _OfflineExecutionBlocker:
    """Stand-in used only where ComfyUI is not importable, i.e. in the offline suite.

    The engine's real ExecutionBlocker is what ships; this keeps the block importable and its
    contract testable without a running ComfyUI.
    """

    def __init__(self, message):
        self.message = message


def _execution_blocker(message):
    try:
        from comfy_execution.graph import ExecutionBlocker
    except ImportError:
        return _OfflineExecutionBlocker(message)
    return ExecutionBlocker(message)


def _runtime_from(inputs):
    runtime = inputs.pop(_RUNTIME_KEY, None)
    if runtime is None:
        raise LocalValidationError(
            "compiled runtime context is missing; the compiler must inject "
            f"{_RUNTIME_KEY!r} without exposing it as a widget"
        )
    return runtime


def _selected_route(route, route_ids, values):
    if len(route_ids) == 1:
        return route
    selected = values.get("model")
    if not isinstance(selected, str) or not selected:
        raise LocalValidationError("a multi-route node requires its selected model")
    return selected


def _image_semantics(value):
    if isinstance(value, LocalImagePlan):
        return [frame.digest for frame in value.frames]
    if isinstance(value, ReferenceSet):
        return [content_hash(encode_frame(frame).data) for frame in value.frames]
    if not isinstance(value, torch.Tensor) or value.ndim != 4:
        return value
    return [content_hash(encode_frame(frame).data) for frame in value]


def _normalized_payload(payload, contract):
    normalized = {}
    for name, value in payload.items():
        semantic = _image_semantics(value)
        if isinstance(value, torch.Tensor):
            schema_type = contract["fields"][name].get("type")
            if schema_type == "string":
                if len(semantic) != 1:
                    raise LocalValidationError(
                        f"field {name!r} accepts exactly one image"
                    )
                semantic = semantic[0]
        normalized[name] = semantic
    return normalized


def _lifecycle_mode(lifecycle):
    mode = lifecycle.get("mode", lifecycle.get("type"))
    if mode in {"poll", "sync"}:
        return mode
    if mode is None and lifecycle.get("poll"):
        return "poll"
    raise LocalValidationError(
        "provider lifecycle must declare mode/type 'poll' or 'sync'"
    )


def _credential_store(runtime, provider):
    store = _get(runtime, "credential_store", None)
    if store is not None:
        return store
    env_names = _get(runtime, "env_names")
    return ProviderKeyStore(
        provider,
        env_names,
        profile=_get(runtime, "profile", "default"),
        root=_get(runtime, "credential_root", None),
    )


def _headers(runtime, credential, idempotency_key=None):
    make_headers = _get(runtime, "auth_headers", None)
    if make_headers is None:
        raise LocalValidationError("provider fact declares no auth scheme")
    headers = dict(make_headers(credential))
    header_name = _get(runtime, "idempotency_header", None)
    if idempotency_key is not None:
        if not header_name:
            raise LocalValidationError(
                "an idempotency key exists but the provider fact has no header contract"
            )
        headers[str(header_name)] = str(idempotency_key)
    return headers


async def _json_request(
    runtime,
    method,
    url,
    *,
    deadline,
    timeout,
    credential,
    payload=None,
    idempotency_key=None,
    billable_submit=False,
):
    transport = _get(runtime, "http_request", http_request)
    request_options = {
        "deadline": deadline,
        "request_timeout": timeout,
        "headers": _headers(runtime, credential, idempotency_key),
        "json": payload,
    }
    if billable_submit:
        request_options["billable_submit"] = True
    response = await _call(transport, method, url, **request_options)
    if isinstance(response, Mapping):
        return response
    if not isinstance(response, HttpResponse):
        raise EmptyOrMalformedSuccessError(
            "provider transport returned neither JSON nor HttpResponse"
        )
    try:
        decoded = json.loads(response.body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EmptyOrMalformedSuccessError(
            "provider response was not valid JSON"
        ) from exc
    if not isinstance(decoded, Mapping):
        raise EmptyOrMalformedSuccessError(
            "provider response JSON was not an object"
        )
    return decoded


async def _download_stream(runtime, url, *, deadline, timeout):
    custom = _get(runtime, "download", None)
    if custom is not None:
        response = await _call(custom, url, deadline=deadline, request_timeout=timeout)
    else:
        transport = _get(runtime, "http_request", http_request)
        response = await _call(
            transport,
            "GET",
            url,
            deadline=deadline,
            request_timeout=timeout,
            headers=None,
        )
    if isinstance(response, DownloadStream):
        return response
    if isinstance(response, HttpResponse):
        body = response.body
        content_type = response.headers.get("Content-Type")
        content_length = response.headers.get("Content-Length")
    elif isinstance(response, (bytes, bytearray, memoryview)):
        body = bytes(response)
        content_type = None
        content_length = len(body)
    else:
        raise EmptyOrMalformedSuccessError(
            "download transport returned no byte stream"
        )

    async def chunks():
        yield body

    return DownloadStream(chunks(), content_type, content_length)


def _cache_envelope(result, body):
    try:
        encoded_result = json.dumps(
            result, sort_keys=True, separators=(",", ":"), allow_nan=False
        )
    except (TypeError, ValueError) as exc:
        raise LocalValidationError(
            "terminal provider result is not cache-serializable"
        ) from exc
    return json.dumps(
        {
            "result": json.loads(encoded_result),
            "body": base64.b64encode(body).decode("ascii"),
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _read_cache(cache, key):
    raw = cache.read(key)
    if raw is None:
        return None
    try:
        envelope = json.loads(raw)
        result = envelope["result"]
        body = base64.b64decode(envelope["body"], validate=True)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise LocalValidationError(
            "semantic cache entry is malformed; refusing a replacement submit"
        ) from exc
    if not isinstance(result, Mapping) or not body:
        raise LocalValidationError(
            "semantic cache entry is incomplete; refusing a replacement submit"
        )
    return result, body


async def _materialize(runtime, lifecycle, result, *, deadline, cached_body=None):
    captured = bytearray()

    async def download(url):
        if cached_body is not None:
            async def cached_chunks():
                yield cached_body

            stream = DownloadStream(cached_chunks(), "image/png", len(cached_body))
        else:
            stream = await _download_stream(
                runtime,
                url,
                deadline=deadline,
                timeout=float(_get(runtime, "request_timeout", 60)),
            )

        async def capturing_chunks():
            async for chunk in stream.chunks:
                captured.extend(chunk)
                yield chunk

        return DownloadStream(
            capturing_chunks(),
            stream.content_type,
            stream.content_length,
        )

    image = await image_from_result(
        result,
        success_states=lifecycle["status_done"],
        status_path=lifecycle["status_path"],
        output_path=(
            lifecycle["artifact_path"]
            if _lifecycle_mode(lifecycle) == "sync"
            else lifecycle["outputs_path"]
        ),
        download=download,
        max_bytes=int(_get(runtime, "max_download_bytes")),
        interrupt=_get(runtime, "interrupt", lambda: None),
    )
    return image, bytes(captured)


async def _prepare_images(
    runtime,
    provider,
    lifecycle,
    contract,
    payload,
    credential,
    *,
    deadline,
    on_progress=None,
):
    prepared_payload = dict(payload)
    upload_cache = _get(runtime, "upload_cache", _UPLOAD_CACHE)
    upload = _get(runtime, "upload_large_file")
    now_value = _get(runtime, "now", time.time)
    now = now_value() if callable(now_value) else now_value

    for name, value in payload.items():
        if not isinstance(value, (torch.Tensor, ReferenceSet, LocalImagePlan)):
            continue
        schema = contract["fields"][name]
        policy = "batch" if schema.get("type") == "array" else "exactly-one"
        limits_factory = _get(runtime, "image_limits", None)
        limits = (
            limits_factory(name, schema, lifecycle)
            if limits_factory is not None
            else ImageLimits(lifecycle["upload_max_bytes"])
        )

        async def upload_one(data, filename, content_type):
            return await _call(
                upload,
                data,
                filename,
                content_type,
                credential=credential,
                lifecycle=lifecycle,
                base_url=_get(runtime, "base_url"),
                deadline=deadline,
                request_timeout=float(
                    _get(
                        runtime,
                        "upload_request_timeout",
                        _get(runtime, "request_timeout", 60),
                    )
                ),
            )

        prepared = await prepare_image_inputs(
            value,
            provider=provider,
            batch_policy=policy,
            limits=limits,
            cache=upload_cache,
            upload_large_file=upload_one,
            now=now,
            remote_exists=_get(runtime, "remote_exists", None),
            on_progress=on_progress,
        )
        urls = [image.asset.url for image in prepared.images]
        if any(not isinstance(url, str) or not url for url in urls):
            raise LocalValidationError(
                f"provider route field {name!r} requires uploaded URLs"
            )
        prepared_payload[name] = urls if policy == "batch" else urls[0]
    return prepared_payload


async def execute_compiled_node(node_id, provider, route, inputs) -> tuple:
    """Execute one compiled media node as admit/prepare/submit/observe/materialize."""
    values = dict(inputs)
    runtime = _runtime_from(values)
    provider_fact = _get(runtime, "provider_fact")
    route_ids = tuple(_get(runtime, "route_ids", (route,)))
    selected_route = _selected_route(route, route_ids, values)
    projection = route_projection(route_ids, provider_fact)
    payload = build_route_payload(projection, selected_route, values)
    try:
        contract = provider_fact["routes"][selected_route]
        lifecycle = provider_fact["lifecycle"]
    except (KeyError, TypeError) as exc:
        raise LocalValidationError("provider fact is missing route lifecycle data") from exc
    normalized = _normalized_payload(payload, contract)
    live = bool(values.get("live", False))
    refresh_nonce = values.get("refresh_nonce", "")
    store = _credential_store(runtime, provider)
    credential = None
    cache_identity = {
        "node_id": node_id,
        "provider": provider,
        "route": selected_route,
    }
    cache_provider = provider
    if live:
        credential = store.resolve(values.get("api_key", ""))
        fingerprint = credential_fingerprint(provider, credential)
        cache_identity["account_fingerprint"] = fingerprint
        cache_provider = f"{provider}:{fingerprint}"
    key = semantic_key(
        cache_identity,
        normalized,
        refresh_nonce,
    )
    cache = _get(runtime, "semantic_cache", None)

    if live and cache is None:
        raise LocalValidationError(
            "live execution requires semantic cache storage"
        )
    if live:
        cached = _read_cache(cache, key)
        if cached is not None:
            result, body = cached
            deadline = time.monotonic() + float(_get(runtime, "deadline_seconds", 600))
            image, _ = await _materialize(
                runtime, lifecycle, result, deadline=deadline, cached_body=body
            )
            return (image,)

    ledger = _get(runtime, "ledger", _LEDGER)
    admission = await admit(
        validate=lambda: dict(normalized),
        resolve_credential=lambda: (
            credential
            if credential is not None
            else store.resolve(values.get("api_key", ""))
        ),
        formula=contract["formula"],
        base_price=contract["price"],
        live=live,
        per_operation_ceiling=_get(
            runtime,
            "per_operation_ceiling",
            values.get("max_spend_usd", 0.0),
        ),
        run_ceiling=_get(
            runtime,
            "run_ceiling",
            values.get("max_spend_usd", 0.0),
        ),
        run_id=_get(runtime, "run_id", node_id),
        account=_get(runtime, "account", f"{provider}:default"),
        ledger=ledger,
        max_in_flight=int(_get(runtime, "max_in_flight", 1)),
        read_balance=_get(runtime, "read_balance", None),
    )
    if isinstance(admission, DryRun):
        # Produce nothing, on purpose — and say so through the engine's own mechanism. Returning
        # an empty tuple made ComfyUI hand `None` to the declared output slot, and the first
        # downstream consumer crashed inside stock code: PreviewImage died on
        # `images[0].shape[1]` with "'NoneType' object is not subscriptable" (measured live,
        # 2026-07-29). The user saw a crash in someone else's node instead of "this was a dry
        # run". ExecutionBlocker stops the branch and carries the reason.
        # No artifact is still returned, which is what COST.md:16-17 requires.
        return (_execution_blocker(
            f"dry run: {node_id} did not call {provider}. "
            f"Estimated cost ${admission.estimated_usd:.4f}. Set `live` to spend."
        ),)

    deadline = time.monotonic() + float(_get(runtime, "deadline_seconds", 600))
    reservation_id = admission.reservation_id
    accounted = False
    attempt = int(_get(runtime, "attempt", 1))
    account = _get(runtime, "account", f"{provider}:default")
    request_timeout = float(_get(runtime, "request_timeout", 60))
    base_url = _get(runtime, "base_url")
    external_persist = _get(runtime, "persist")
    idempotency_key = _get(runtime, "idempotency_key", None)
    mode = _lifecycle_mode(lifecycle)
    progress = make_progress_callback(
        _get(runtime, "progress_bar"),
        _get(runtime, "send_status"),
        node_id=_get(runtime, "node_id", node_id),
        prompt_id=_get(runtime, "prompt_id"),
        node_type=_get(runtime, "node_type", node_id),
        queued_states=lifecycle.get("status_queued", ()),
    )

    async def persist(record):
        nonlocal accounted
        identity = record.get("task_id")
        if mode == "sync" and not identity:
            identity = (
                record.get("submission_id")
                or f"sync:{reservation_id}:attempt:{attempt}"
            )
        if identity and not accounted:
            ledger.record_submission(
                reservation_id,
                task_id=identity,
                indeterminate=False,
            )
            accounted = True
        await _call(external_persist, dict(record))

    async def send(method, url, *, payload, timeout, idempotency_key):
        return await _json_request(
            runtime,
            method,
            url,
            deadline=deadline,
            timeout=timeout,
            credential=admission.credential,
            payload=payload,
            idempotency_key=idempotency_key,
            billable_submit=True,
        )

    async def record_indeterminate(exc):
        nonlocal accounted
        blocked_by_guard = bool(
            getattr(exc, "record", {}).get("blocked_by_submit_guard")
        )
        record = {
            "task_id": None,
            "attempt": attempt,
            "estimate": admission.estimated_usd,
            "provider_account": account,
            **getattr(exc, "record", {}),
            "indeterminate": True,
        }
        exc.record = dict(record)
        if not accounted and not blocked_by_guard:
            ledger.record_submission(
                reservation_id,
                task_id=record.get("task_id"),
                indeterminate=True,
            )
            accounted = True
        await _call(external_persist, record)

    def claim_billable_submit():
        claimed = cache.claim_submit(
            key,
            {
                "node_id": node_id,
                "provider": provider,
                "route": selected_route,
                "status": "submit_may_be_in_flight",
            },
        )
        if not claimed:
            error = IndeterminateSubmitError(
                "A previous submit with these exact generation settings may already have "
                "reached the provider. Check the provider dashboard. To intentionally "
                "authorize a separate paid generation, duplicate this prompt node."
            )
            error.record = {"blocked_by_submit_guard": True}
            raise error

    async def guarded_submit(submit):
        claim_billable_submit()
        try:
            result = await submit()
        except IndeterminateSubmitError:
            raise
        except BaseException:
            cache.release_submit(key)
            raise
        else:
            cache.release_submit(key)
            return result

    try:
        await progress(0.0, "preparing references")

        async def reference_progress(completed, total, state):
            if state == "uploading":
                label = f"Uploading references — {completed + 1}/{total}"
            else:
                label = f"References ready — {completed}/{total}"
            await progress(completed / max(1, total), label)

        prepared_payload = await _prepare_images(
            runtime,
            cache_provider,
            lifecycle,
            contract,
            payload,
            admission.credential,
            deadline=deadline,
            on_progress=reference_progress,
        )
        terminal_result = None

        if mode == "sync":
            captured = {}

            async def sync_send(*args, **kwargs):
                response = await send(*args, **kwargs)
                captured["response"] = response
                return response

            async def run_sync_submit():
                return await submit_sync(
                    sync_send,
                    persist,
                    base_url=base_url,
                    route=selected_route,
                    lifecycle=lifecycle,
                    payload=prepared_payload,
                    estimate=admission.estimated_usd,
                    provider_account=account,
                    attempt=attempt,
                    request_timeout=request_timeout,
                    idempotency_key=idempotency_key,
                )

            try:
                await guarded_submit(run_sync_submit)
            except IndeterminateSubmitError as exc:
                await record_indeterminate(exc)
                raise
            terminal_result = captured["response"]
        else:
            async def run_billable_submit():
                return await submit_billable(
                    send,
                    persist,
                    base_url=base_url,
                    route=selected_route,
                    lifecycle=lifecycle,
                    payload=prepared_payload,
                    estimate=admission.estimated_usd,
                    provider_account=account,
                    attempt=attempt,
                    request_timeout=request_timeout,
                    idempotency_key=idempotency_key,
                )

            try:
                task_id = await guarded_submit(run_billable_submit)
            except IndeterminateSubmitError as exc:
                await record_indeterminate(exc)
                raise

            observed = {}

            async def poll_request(method, url, *, timeout):
                response = await _json_request(
                    runtime,
                    method,
                    url,
                    deadline=deadline,
                    timeout=timeout,
                    credential=admission.credential,
                )
                observed["response"] = response
                return response

            await poll_task(
                poll_request,
                base_url=base_url,
                route=selected_route,
                task_id=task_id,
                lifecycle=lifecycle,
                deadline_seconds=max(0.001, deadline - time.monotonic()),
                poll_interval=float(_get(runtime, "poll_interval", 1)),
                request_timeout=request_timeout,
                max_nonqueued_polls=_get(runtime, "max_nonqueued_polls", None),
                on_progress=progress,
                interrupted=_get(runtime, "interrupted", None),
            )
            terminal_result = observed["response"]

        image, body = await _materialize(
            runtime, lifecycle, terminal_result, deadline=deadline
        )
        ledger.settle(reservation_id)
        cache.write(key, _cache_envelope(terminal_result, body))
        return (image,)
    except BaseException:
        if not accounted:
            ledger.release(reservation_id)
        raise


__all__ = ["execute_compiled_node"]
