"""One billable synchronous submit whose response contains the artifact."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Mapping

from ..errors_taxonomy import EmptyOrMalformedSuccessError, IndeterminateSubmitError


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


async def submit_sync(
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
    """Submit once and return the fact-declared artifact from that response."""
    if lifecycle.get("mode") != "sync":
        raise ValueError("provider lifecycle.mode must be 'sync'")
    if int(attempt) < 1:
        raise ValueError("attempt must be at least 1")

    record = {
        "submission_id": idempotency_key,
        "attempt": int(attempt),
        "estimate": estimate,
        "provider_account": provider_account,
    }
    await _call(persist, record)

    method, template = lifecycle["submit"].split(None, 1)
    try:
        response = await send(
            method,
            template.format(base_url=base_url, route=route),
            payload=payload,
            timeout=request_timeout,
            idempotency_key=idempotency_key,
        )
    except (ConnectionError, TimeoutError, asyncio.CancelledError) as exc:
        raise IndeterminateSubmitError(
            "the synchronous billable request may have been accepted; it was not replayed"
        ) from exc

    artifact = _path(response, lifecycle["artifact_path"])
    if artifact in (None, "", [], {}):
        raise EmptyOrMalformedSuccessError(
            "the provider accepted the synchronous request but returned no artifact"
        )
    return artifact


__all__ = ["submit_sync"]
