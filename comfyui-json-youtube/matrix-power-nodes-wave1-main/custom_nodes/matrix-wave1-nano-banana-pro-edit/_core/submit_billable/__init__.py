"""Exactly one billable POST with narrow durable lifecycle callbacks."""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from ..errors_taxonomy import IndeterminateSubmitError

IndeterminateSubmit = IndeterminateSubmitError


class SubmitResponseLost(Exception):
    """The request may have arrived, but no response was received."""


class SubmitDefinitelyNotSent(Exception):
    """Transport proves no request bytes were written."""


class DefiniteSubmissionRejection(RuntimeError):
    def __init__(self, message, *, response, billing="not_billed"):
        super().__init__(message)
        self.response = dict(response)
        self.billing = billing


class SubmissionPersistenceError(RuntimeError):
    def __init__(self, record):
        task = record.get("task_id")
        super().__init__(f"submission identity could not be persisted for task {task}")
        self.record = dict(record)


class SubmissionRecorder(Protocol):
    async def before_send(self, record: Mapping[str, Any]) -> None: ...
    async def accepted(self, record: Mapping[str, Any]) -> None: ...
    async def indeterminate(self, record: Mapping[str, Any]) -> None: ...


@dataclass(frozen=True)
class SubmittedTask:
    task_id: str
    response: Mapping[str, Any]


def _endpoint(specification, **values):
    method, template = specification.split(None, 1)
    return method, template.format(**values)


def _path(value, dotted_path):
    current = value
    for part in dotted_path.split("."):
        if not isinstance(current, Mapping) or part not in current:
            return None
        current = current[part]
    return current


async def _call(function, *args, **kwargs):
    result = function(*args, **kwargs)
    return await result if inspect.isawaitable(result) else result


def _application_rejection(response, lifecycle):
    """Return the declared rejection tuple; absence of facts is indeterminate."""
    classifier = lifecycle.get("application_envelope")
    if not isinstance(classifier, Mapping) or not isinstance(response, Mapping):
        return None
    code = _path(response, classifier.get("code_path", "code"))
    if code is None:
        return None
    success = classifier.get("success_codes", ())
    if code in success or str(code) in {str(item) for item in success}:
        return None
    message = _path(response, classifier.get("message_path", "message"))
    return str(message or f"provider application code {code}"), classifier.get("rejection_billing", "not_billed")


async def submit_billable(
    send, recorder: SubmissionRecorder, *, base_url, route, lifecycle, payload,
    estimate, provider_account, attempt=1, request_timeout=60, idempotency_key=None,
) -> SubmittedTask:
    """Submit once; all outcomes after the durable pre-send marker retain the claim."""
    if int(attempt) < 1:
        raise ValueError("attempt must be at least 1")
    if idempotency_key is not None and not lifecycle.get("idempotency_supported", False):
        raise ValueError("idempotency key requires an explicit lifecycle fact")
    record = {
        "task_id": None, "attempt": int(attempt), "estimate": estimate,
        "provider_account": provider_account,
    }
    await _call(recorder.before_send, dict(record))
    method, url = _endpoint(lifecycle["submit"], base_url=base_url, route=route)
    try:
        response = await send(method, url, payload=payload, timeout=request_timeout, idempotency_key=idempotency_key)
    except SubmitDefinitelyNotSent:
        raise
    except (SubmitResponseLost, asyncio.CancelledError) as exc:
        error_record = {**record, "indeterminate": True}
        try:
            await _call(recorder.indeterminate, error_record)
        except Exception:
            pass
        error = IndeterminateSubmitError(
            "indeterminate_submit: the billable request may have been accepted; it was not replayed",
            record=error_record,
        )
        raise error from exc
    except IndeterminateSubmitError as exc:
        exc.record = {**record, **getattr(exc, "record", {}), "indeterminate": True}
        try:
            await _call(recorder.indeterminate, exc.record)
        except Exception:
            pass
        raise
    except TimeoutError as exc:
        # A bare timeout gives no proof about whether request bytes crossed the
        # socket. Other transport failures must arrive already typed by the
        # transport boundary (definitely-not-sent or indeterminate).
        error_record = {**record, "indeterminate": True}
        try:
            await _call(recorder.indeterminate, error_record)
        except Exception:
            pass
        error = IndeterminateSubmitError(
            "indeterminate_submit: the billable request may have been accepted; it was not replayed",
            record=error_record,
        )
        raise error from exc

    rejection = _application_rejection(response, lifecycle)
    if rejection is not None:
        message, billing = rejection
        raise DefiniteSubmissionRejection(message, response=response, billing=billing)

    task_id = _path(response, lifecycle["task_id_path"])
    if task_id in (None, ""):
        error_record = {**record, "indeterminate": True}
        try:
            await _call(recorder.indeterminate, error_record)
        except Exception:
            pass
        raise IndeterminateSubmitError(
            "indeterminate_submit: the response contained no task id; the request may already be billable and it was not replayed",
            record=error_record,
        )
    record["task_id"] = str(task_id)
    record["response_digest"] = hashlib.sha256(
        json.dumps(response, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()
    try:
        await _call(recorder.accepted, dict(record))
    except Exception as exc:
        raise SubmissionPersistenceError(record) from exc
    return SubmittedTask(record["task_id"], dict(response))


__all__ = [
    "DefiniteSubmissionRejection", "IndeterminateSubmit", "SubmissionPersistenceError",
    "SubmissionRecorder", "SubmitDefinitelyNotSent", "SubmitResponseLost", "SubmittedTask",
    "submit_billable",
]
