"""One billable submission, with durable submission identity."""

from __future__ import annotations

import inspect
from collections.abc import Mapping

from ..errors_taxonomy import IndeterminateSubmitError

# Compatibility name for existing compiled imports; this is the canonical taxonomy class,
# not a second submit-owned exception type.
IndeterminateSubmit = IndeterminateSubmitError


class SubmitResponseLost(Exception):
    """The request may have arrived, but no response was received."""


class SubmissionPersistenceError(RuntimeError):
    def __init__(self, record):
        super().__init__(
            f"submission identity could not be persisted for task {record['task_id']}"
        )
        self.record = dict(record)


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


async def submit_billable(
    send,
    persist,
    *,
    base_url,
    route,
    lifecycle,
    payload,
    estimate,
    provider_account,
    attempt=1,
    request_timeout=60,
    idempotency_key=None,
):
    """Submit once, never replaying a response whose outcome is unknown."""
    if int(attempt) < 1:
        raise ValueError("attempt must be at least 1")

    record = {
        "task_id": None,
        "attempt": int(attempt),
        "estimate": estimate,
        "provider_account": provider_account,
    }
    await _call(persist, record)

    method, url = _endpoint(
        lifecycle["submit"], base_url=base_url, route=route
    )
    try:
        response = await send(
            method,
            url,
            payload=payload,
            timeout=request_timeout,
            idempotency_key=idempotency_key,
        )
    except SubmitResponseLost as exc:
        raise IndeterminateSubmitError(
            "indeterminate_submit: the billable request may have been accepted; "
            "no response was received and it was not replayed",
            record=record,
        ) from exc
    except IndeterminateSubmitError as exc:
        exc.record = {**record, **exc.record}
        raise

    task_id = _path(response, lifecycle["task_id_path"])
    if task_id in (None, ""):
        raise IndeterminateSubmitError(
            "indeterminate_submit: the response contained no task id; "
            "the request may already be billable and it was not replayed",
            record=record,
        )

    record["task_id"] = str(task_id)
    try:
        await _call(persist, record)
    except Exception as exc:
        raise SubmissionPersistenceError(record) from exc
    return record["task_id"]


__all__ = [
    "SubmissionPersistenceError",
    "SubmitResponseLost",
    "submit_billable",
]
