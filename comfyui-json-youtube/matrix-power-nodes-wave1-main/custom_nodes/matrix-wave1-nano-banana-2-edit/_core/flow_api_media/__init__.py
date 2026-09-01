"""Five-stage composition for compiled paid API media nodes."""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import time
from collections.abc import Mapping
from pathlib import Path

import torch

from ..auth_provider_key import ProviderKeyStore
from ..cache_semantic import (
    OperationIdentity,
    OperationConflictError,
    OperationJournal,
    OperationStorageError,
    credential_fingerprint,
    operation_error,
    semantic_key,
)
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
    validate_image_cardinality,
)
from ..media_image_in import prepare_image_inputs
from ..media_image_out import DownloadStream, ImageOutputError, image_from_result
from ..poll_task import PollFailed, poll_task
from ..route_multi import build_route_payload, route_projection
from ..spend_admission import DryRun, RunLedger, admit
from ..submit_billable import (
    DefiniteSubmissionRejection,
    SubmissionPersistenceError,
    SubmitDefinitelyNotSent,
    submit_billable,
)
from ..transport_http import (
    HttpDownloadStream,
    HttpResponse,
    download_stream as http_download_stream,
    request as http_request,
    validate_download_url,
)
from ..ui_progress import make_progress_callback


MISSING = object()
_MISSING = object()
_LEDGER = RunLedger()
_UPLOAD_CACHE = UploadCache()
_RUNTIME_KEY = "__flow_runtime__"
_SIZE_PRESET_PIXELS = {
    "1:1": (2048, 2048),
    "16:9": (2752, 1536),
    "9:16": (1536, 2752),
    "4:3": (2368, 1792),
    "3:4": (1792, 2368),
    "3:2": (2496, 1664),
    "2:3": (1664, 2496),
}


def is_link(value):
    """Fail closed for every non-scalar raw prompt value.

    Comfy's canonical link is a two-item list, but authorization must not depend
    on recognizing one exact container shape.  Malformed or nested containers
    can still be resolved by an alternate caller before reaching this function.
    """
    return isinstance(value, (Mapping, list, tuple, set, frozenset))


def parse_live_mode(value: object, *, raw_value: object = MISSING) -> bool:
    """Authorize provider work only for one local, literal Boolean toggle value."""
    if raw_value is MISSING:
        raise LocalValidationError("live must be a literal boolean toggle value")
    if is_link(raw_value):
        raise LocalValidationError(
            "live must be selected on this node; connected authorization is refused"
        )
    if type(raw_value) is not bool or type(value) is not bool:
        raise LocalValidationError("live must be exactly boolean false or true")
    if value is not raw_value:
        raise LocalValidationError("resolved live value does not match the raw prompt toggle")
    return value is True


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


def _validate_raw_image_cardinality(payload, contract):
    """Reject structural IMAGE bounds before semantic encoding or external work."""
    required = set(contract.get("required", ()))
    for name, value in payload.items():
        if not isinstance(value, (torch.Tensor, ReferenceSet, LocalImagePlan)):
            continue
        schema = contract.get("fields", {}).get(name, {})
        validate_image_cardinality(
            value,
            field=name,
            required=name in required,
            min_items=schema.get("minItems"),
            max_items=schema.get("maxItems"),
        )


def _is_composed_size_contract(contract):
    spec = contract.get("fields", {}).get("size", {})
    return (
        spec.get("type") == "string"
        and "minimum" in spec
        and "maximum" in spec
    )


def _compose_size_values(values, contract):
    """Replace the local size composer widgets with exactly one provider field."""
    if not _is_composed_size_contract(contract):
        return values
    composed = dict(values)
    spec = contract["fields"]["size"]
    selector = composed.pop("size", "auto")
    width = composed.pop("width", 0)
    height = composed.pop("height", 0)
    for name, value in (("width", width), ("height", height)):
        if isinstance(value, bool) or not isinstance(value, int):
            raise LocalValidationError(f"size {name} must be an integer")
    if width == 0 and height == 0:
        if selector == "auto":
            return composed
        pixels = _SIZE_PRESET_PIXELS.get(selector)
        if pixels is None:
            raise LocalValidationError(f"unknown size preset {selector!r}")
        width, height = pixels
    elif (width == 0) != (height == 0):
        raise LocalValidationError(
            "size requires width and height to both be 0 (unset) or both be set"
        )
    minimum, maximum = spec["minimum"], spec["maximum"]
    for name, value in (("width", width), ("height", height)):
        if value < minimum or value > maximum:
            raise LocalValidationError(
                f"size {name} {value} is outside contract bounds "
                f"[{minimum}, {maximum}]; use 0 only when both dimensions are unset"
            )
    composed["size"] = f"{width}*{height}"
    return composed


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
    resolver = _get(runtime, "download_resolver", None)
    limit = int(_get(runtime, "max_download_bytes"))
    custom = _get(runtime, "download", None)
    if custom is not None:
        validated_url = validate_download_url(url, **({"resolver": resolver} if resolver else {}))
        response = await _call(custom, validated_url, deadline=deadline, request_timeout=timeout)
    else:
        transport = _get(runtime, "http_request", http_request)
        if transport is http_request:
            response = await http_download_stream(
                url,
                deadline=deadline,
                request_timeout=timeout,
                max_bytes=limit,
                **({"resolver": resolver} if resolver else {}),
            )
        else:
            validated_url = validate_download_url(url, **({"resolver": resolver} if resolver else {}))
            # Deployment test adapters remain unauthenticated; their chunks are
            # still capped by media.image-out before materialization.
            response = await _call(
                transport, "GET", validated_url, deadline=deadline,
                request_timeout=timeout, headers=None,
            )
    if isinstance(response, DownloadStream):
        return response
    if isinstance(response, HttpDownloadStream):
        return DownloadStream(response.chunks, headers=response.headers)
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
            field=name,
            required=name in set(contract.get("required", ())),
            min_items=schema.get("minItems"),
            max_items=schema.get("maxItems"),
        )
        urls = [image.asset.url for image in prepared.images]
        if any(not isinstance(url, str) or not url for url in urls):
            raise LocalValidationError(
                f"provider route field {name!r} requires uploaded URLs"
            )
        prepared_payload[name] = urls if policy == "batch" else urls[0]
    return prepared_payload


async def execute_compiled_node(node_id, provider, route, inputs) -> tuple:
    """Execute or resume one durable paid media operation."""
    values = dict(inputs)
    runtime = _runtime_from(values)
    live = parse_live_mode(values.get("live", MISSING), raw_value=_get(runtime, "raw_live", MISSING))
    provider_fact = _get(runtime, "provider_fact")
    route_ids = tuple(_get(runtime, "route_ids", (route,)))
    selected_route = _selected_route(route, route_ids, values)
    projection = route_projection(route_ids, provider_fact)
    try:
        contract = provider_fact["routes"][selected_route]
        lifecycle = provider_fact["lifecycle"]
    except (KeyError, TypeError) as exc:
        raise LocalValidationError("provider fact is missing route lifecycle data") from exc
    if live and _lifecycle_mode(lifecycle) == "sync":
        raise LocalValidationError("paid Wave 1 sync lifecycle is refused: durable task recovery requires a polled task id")
    values = _compose_size_values(values, contract)
    payload = build_route_payload(projection, selected_route, values)
    _validate_raw_image_cardinality(payload, contract)
    normalized = _normalized_payload(payload, contract)
    ledger = _get(runtime, "ledger", _LEDGER)
    store = _credential_store(runtime, provider)

    async def admission_for(mode, credential=None):
        return await admit(
            validate=lambda: dict(normalized),
            resolve_credential=lambda: credential if credential is not None else store.resolve(values.get("api_key", "")),
            formula=contract["formula"], base_price=contract["price"], live=mode,
            per_operation_ceiling=_get(runtime, "per_operation_ceiling", values.get("max_spend_usd", 0.0)),
            run_ceiling=_get(runtime, "run_ceiling", values.get("max_spend_usd", 0.0)),
            run_id=_get(runtime, "run_id", node_id), account=_get(runtime, "account", f"{provider}:default"),
            ledger=ledger, max_in_flight=int(_get(runtime, "max_in_flight", 1)),
            read_balance=_get(runtime, "read_balance", None),
        )

    if not live:
        dry = await admission_for(False)
        return (_execution_blocker(
            f"dry run: {node_id} did not call {provider}. Estimated cost ${dry.estimated_usd:.4f}. Set `live` to spend."
        ),)

    # A compiled runtime may provide a non-secret account fingerprint when it can
    # identify an exact cached operation without touching the credential source.
    # Never memoize a resolved credential here: a key-store rotation in the same
    # process must still isolate a new account from the old account's artifact.
    credential = None
    fingerprint = _get(runtime, "credential_fingerprint", None)
    if not isinstance(fingerprint, str) or not fingerprint:
        credential = store.resolve(values.get("api_key", ""))
        fingerprint = credential_fingerprint(provider, credential)
    artifact_version = str(_get(runtime, "artifact_semantics_version"))
    payload_bytes = json.dumps(normalized, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    payload_sha256 = hashlib.sha256(payload_bytes).hexdigest()
    key = semantic_key({
        "node_id": node_id, "provider": provider, "route": selected_route,
        "account_fingerprint": fingerprint, "artifact_semantics_version": artifact_version,
    }, normalized, values.get("refresh_nonce", ""))
    journal = _get(runtime, "operation_journal", None)
    if journal is None:
        legacy_cache = _get(runtime, "semantic_cache", None)
        if legacy_cache is None or not hasattr(legacy_cache, "root"):
            raise LocalValidationError("live execution requires the durable operation journal")
        journal = OperationJournal(Path(legacy_cache.root).parent / "paid-operations")
    actor = _get(runtime, "actor", {
        "process_boot_uuid": str(_get(runtime, "process_boot_uuid", "offline-test")),
        "prompt_id": str(_get(runtime, "prompt_id", "")),
        "node_instance_id": str(_get(runtime, "node_id", node_id)),
        "node_type": str(_get(runtime, "node_type", node_id)),
    })
    identity = OperationIdentity(key, provider, selected_route, fingerprint, str(_get(runtime, "node_type", node_id)), artifact_version, payload_sha256)
    decision = journal.enter(identity, actor)
    deadline = time.monotonic() + float(_get(runtime, "deadline_seconds", 600))
    request_timeout = float(_get(runtime, "request_timeout", 60))
    progress = make_progress_callback(
        _get(runtime, "progress_bar"), _get(runtime, "send_status"),
        node_id=_get(runtime, "node_id", node_id), prompt_id=_get(runtime, "prompt_id"),
        node_type=_get(runtime, "node_type", node_id), queued_states=lifecycle.get("status_queued", ()),
    )

    async def decode_retained(snapshot, label):
        await progress(1.0, label)
        body = journal.read_artifact(snapshot)
        image, _ = await _materialize(runtime, lifecycle, snapshot.terminal, deadline=deadline, cached_body=body)
        return (image,)

    async def dispatch_retained_decision(current):
        """Return a retained result or raise its durable refusal; otherwise continue."""
        if current.kind == "cached":
            return await decode_retained(
                current.snapshot, "Using cached result — no provider request"
            )
        if current.kind == "refused":
            snap = current.snapshot
            if snap.state == "CACHED":
                raise IndeterminateSubmitError(
                    "The prior operation is retained but its cached artifact is missing or corrupt. Replacement submit is refused."
                )
            kind = (snap.last_error or {}).get("kind", "failure")
            raise IndeterminateSubmitError(
                f"WaveSpeed task {snap.task_id or 'unknown'} ended with {kind} and may have been billed. These exact settings will not be submitted again. Duplicate this node, or change a provider-facing generation input, to authorize a separate paid generation."
            )
        if current.kind == "recovery_required":
            raise IndeterminateSubmitError(
                f"A prior paid submit may have reached WaveSpeed, but no task id is durably recoverable. No new submit was made. Check the provider dashboard and preserve operation {key[:12]}."
            )
        return MISSING

    retained = await dispatch_retained_decision(decision)
    if retained is not MISSING:
        return retained
    if decision.kind == "join":
        await progress(0.0, "Joining the existing paid operation — no new WaveSpeed task will be submitted")
        while time.monotonic() < deadline:
            snapshot = await journal.wait_for_change(key, decision.snapshot.version, min(1.0, max(0.001, deadline - time.monotonic())))
            if snapshot.version > decision.snapshot.version:
                decision = journal.enter(identity, actor)
                if decision.kind != "join":
                    break
        else:
            raise IndeterminateSubmitError("The existing paid operation is still owned; no new submit was made")

        # The owner may have completed, retained a billed failure, or left an
        # unrecoverable submit marker while this caller waited.  Re-dispatch the
        # new journal decision before entering any resume/materialization path.
        retained = await dispatch_retained_decision(decision)
        if retained is not MISSING:
            return retained

    snapshot = decision.snapshot
    if decision.kind == "resume" and snapshot.state in {"MATERIALIZED", "CACHED"}:
        if snapshot.state == "MATERIALIZED":
            await progress(1.0, f"Finishing the local cache for WaveSpeed task {snapshot.task_id}")
            snapshot = journal.commit_cached(key)
        return await decode_retained(snapshot, "Using cached result — no provider request")

    admission = None
    reservation_id = None
    accounted = decision.kind == "resume"
    task_id = snapshot.task_id
    terminal_result = snapshot.terminal
    claim_token = decision.claim_token
    cache_provider = f"{provider}:{fingerprint}"

    if decision.kind == "owner":
        try:
            if credential is None:
                credential = store.resolve(values.get("api_key", ""))
            admission = await admission_for(True, credential)
            reservation_id = admission.reservation_id
            await progress(0.0, "preparing references")

            async def reference_progress(completed, total, state):
                label = f"Uploading references — {completed + 1}/{total}" if state == "uploading" else f"References ready — {completed}/{total}"
                await progress(completed / max(1, total), label)

            prepared_payload = await _prepare_images(
                runtime, cache_provider, lifecycle, contract, payload, credential,
                deadline=deadline, on_progress=reference_progress,
            )
        except BaseException as exc:
            error = operation_error("provider_failed", str(exc), "not_billed", "requeue_same_node")
            journal.record_definite_not_billed(key, claim_token, error)
            if reservation_id is not None:
                ledger.release(reservation_id)
            raise

        estimate_microusd = int(round(admission.estimated_usd * 1_000_000))

        class Recorder:
            async def before_send(self, record):
                try:
                    journal.mark_submit_started(key, claim_token, attempt=record["attempt"], estimate_microusd=estimate_microusd)
                except Exception as exc:
                    # No transport call is reachable until this callback returns.
                    # Re-arm when storage recovered; otherwise the untouched claim
                    # still has no submit marker and is safe from a replacement POST.
                    try:
                        journal.record_definite_not_billed(
                            key, claim_token,
                            operation_error("storage_failed", str(exc), "not_billed", "requeue_same_node"),
                        )
                    except Exception:
                        pass
                    raise SubmitDefinitelyNotSent("durable pre-send marker failed") from exc

            async def accepted(self, record):
                nonlocal accounted
                journal.rescue_task(key, record["task_id"])
                retry_until = deadline
                while True:
                    try:
                        journal.record_submitted(key, claim_token, task_id=record["task_id"], response_digest=record["response_digest"])
                        break
                    except OperationStorageError:
                        if time.monotonic() >= retry_until:
                            raise
                        await asyncio.sleep(min(0.05, max(0.0, retry_until - time.monotonic())))
                if not accounted:
                    ledger.record_submission(reservation_id, task_id=record["task_id"], indeterminate=False)
                    accounted = True

            async def indeterminate(self, record):
                nonlocal accounted
                error = operation_error("indeterminate_submit", "The paid submit outcome is indeterminate", "possibly_billed", "required_operator", record.get("task_id"))
                try:
                    journal.record_error(key, {"CLAIMED"}, error)
                except OperationStorageError:
                    pass
                if not accounted:
                    ledger.record_submission(reservation_id, task_id=record.get("task_id"), indeterminate=True)
                    accounted = True

        async def send(method, url, *, payload, timeout, idempotency_key):
            # The transport returned after the billable request was scheduled.  A
            # malformed HTTP-200 body therefore is not a pre-send failure: it must
            # pass through submit.billable's indeterminate recorder so the ledger
            # retains the admission exposure and this semantic claim cannot re-post.
            try:
                return await _json_request(
                    runtime, method, url, deadline=deadline, timeout=timeout, credential=credential,
                    payload=payload, idempotency_key=idempotency_key, billable_submit=True,
                )
            except EmptyOrMalformedSuccessError as exc:
                raise IndeterminateSubmitError(
                    "indeterminate_submit: the billable response was malformed; it was not replayed"
                ) from exc

        try:
            submitted = await submit_billable(
                send, Recorder(), base_url=_get(runtime, "base_url"), route=selected_route,
                lifecycle=lifecycle, payload=prepared_payload, estimate=admission.estimated_usd,
                provider_account=_get(runtime, "account", f"{provider}:default"),
                attempt=snapshot.version, request_timeout=request_timeout,
                idempotency_key=_get(runtime, "idempotency_key", None),
            )
            task_id = submitted.task_id
        except (SubmitDefinitelyNotSent, DefiniteSubmissionRejection) as exc:
            error = operation_error("provider_failed", str(exc), "not_billed", "requeue_same_node")
            journal.record_definite_not_billed(key, claim_token, error)
            ledger.release(reservation_id)
            raise
        except SubmissionPersistenceError as exc:
            raise OperationStorageError(
                f"WaveSpeed task {exc.record['task_id']} is known but could not be durably recorded. Preserve this task id and reconcile the provider dashboard."
            ) from exc
        except BaseException:
            if not accounted:
                ledger.release(reservation_id)
            raise

    snapshot = journal.read(key)
    if snapshot.state == "SUBMITTED":
        task_id = snapshot.task_id
        await progress(0.0, f"Resuming WaveSpeed task {task_id} — no new charge authorized")
        observed = {}

        async def poll_request(method, url, *, timeout):
            response = await _json_request(runtime, method, url, deadline=deadline, timeout=timeout, credential=credential)
            observed["response"] = response
            return response

        try:
            await poll_task(
                poll_request, base_url=_get(runtime, "base_url"), route=selected_route,
                task_id=task_id, lifecycle=lifecycle,
                deadline_seconds=max(0.001, deadline - time.monotonic()),
                poll_interval=float(_get(runtime, "poll_interval", 1)), request_timeout=request_timeout,
                max_nonqueued_polls=_get(runtime, "max_nonqueued_polls", None), on_progress=progress,
                interrupted=_get(runtime, "interrupted", _get(runtime, "interrupt", None)),
            )
        except PollFailed as exc:
            terminal_result = observed.get("response", {"error": str(exc)})
            error = operation_error("provider_failed", str(exc), "accepted_task", "new_authorization", task_id)
            journal.record_terminal(key, task_id=task_id, outcome="failure", billing_state="accepted_task", terminal=terminal_result)
            journal.record_error(key, {"TERMINAL"}, error)
            raise
        except BaseException as exc:
            kind = "interrupted" if isinstance(exc, (asyncio.CancelledError, KeyboardInterrupt)) else "poll_timeout"
            error = operation_error(kind, str(exc), "accepted_task", "requeue_same_node", task_id)
            journal.record_error(key, {"SUBMITTED"}, error)
            raise
        terminal_result = observed["response"]
        try:
            snapshot = journal.record_terminal(key, task_id=task_id, outcome="success", billing_state="definitely_billed", terminal=terminal_result)
        except OperationConflictError:
            # A concurrent resumer may have observed the same task first.  It is
            # safe to share poll/download work, but only one CAS owns a state
            # transition; adopt its durable result instead of treating it as a
            # provider failure or submitting again.
            snapshot = journal.read(key)

    if snapshot.state == "TERMINAL" and snapshot.terminal_outcome == "success":
        await progress(0.9, f"Recovering output for WaveSpeed task {snapshot.task_id}")
        try:
            image, body = await _materialize(runtime, lifecycle, snapshot.terminal, deadline=deadline)
            media_type = "image/png" if body.startswith(b"\x89PNG") else "image/jpeg" if body.startswith(b"\xff\xd8") else "image/webp" if body[:4] == b"RIFF" else "application/octet-stream"
            try:
                snapshot = journal.record_materialized(key, task_id=snapshot.task_id, body=body, media_type=media_type)
            except OperationConflictError:
                snapshot = journal.read(key)
                if snapshot is None or snapshot.state not in {"MATERIALIZED", "CACHED"}:
                    raise
        except BaseException as exc:
            decode_failure = isinstance(exc, ImageOutputError) and any(
                marker in str(exc).casefold() for marker in ("decod", "recognized image", "content type")
            )
            error = operation_error("decode_failed" if decode_failure else "download_failed", str(exc), snapshot.billing_state, "requeue_same_node", snapshot.task_id)
            journal.record_error(key, {"TERMINAL"}, error)
            raise
    if snapshot.state == "MATERIALIZED":
        try:
            snapshot = journal.commit_cached(key)
        except OperationConflictError:
            snapshot = journal.read(key)
            if snapshot is None or snapshot.state != "CACHED":
                raise
    if reservation_id is not None:
        ledger.settle(reservation_id)
    return await decode_retained(snapshot, "Using cached result — no provider request")


__all__ = ["MISSING", "execute_compiled_node", "is_link", "parse_live_mode"]
