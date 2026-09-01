"""Fact-driven asynchronous task polling."""

from __future__ import annotations

import asyncio
import inspect
import math
import time
from collections.abc import Mapping


class PollError(RuntimeError):
    def __init__(self, message, *, cancel_error=None):
        super().__init__(message)
        self.cancel_error = cancel_error


class PollFailed(PollError):
    def __init__(self, task_id, detail):
        super().__init__(f"task {task_id} failed: {detail}")
        self.detail = detail


class PollEndpointError(PollError):
    pass


class PollDeadlineExceeded(PollError):
    pass


class PollAttemptsExceeded(PollError):
    pass


class PollInterrupted(PollError):
    pass


class PollOutputMissing(PollError):
    pass


class PollRequestTimeout(PollError):
    pass


def _endpoint(specification, **values):
    method, template = specification.split(None, 1)
    if "{route}" in template and values.get("route") is None:
        raise PollEndpointError(
            "endpoint template requires route, but route was not provided"
        )
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


async def _cancel(
    request, lifecycle, base_url, route, task_id, request_timeout
):
    specification = lifecycle.get("cancel")
    if not specification:
        return None
    method, url = _endpoint(
        specification, base_url=base_url, route=route, task_id=task_id
    )
    try:
        await request(method, url, timeout=request_timeout)
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"
    return None


def _positive_number(value, name):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError(f"{name} must be a finite positive number")
    return number


async def poll_task(
    request,
    *,
    base_url,
    route=None,
    task_id,
    lifecycle,
    deadline_seconds,
    poll_interval,
    request_timeout,
    max_nonqueued_polls=None,
    on_progress=None,
    interrupted=None,
    monotonic=time.monotonic,
    sleep=asyncio.sleep,
):
    """Poll until a fact-declared terminal state or a local bound wins."""
    deadline_seconds = _positive_number(deadline_seconds, "deadline_seconds")
    poll_interval = _positive_number(poll_interval, "poll_interval")
    request_timeout = _positive_number(request_timeout, "request_timeout")
    if max_nonqueued_polls is not None and int(max_nonqueued_polls) < 1:
        raise ValueError("max_nonqueued_polls must be at least 1")

    method, url = _endpoint(
        lifecycle["poll"], base_url=base_url, route=route, task_id=task_id
    )
    done = {str(value).strip().lower() for value in lifecycle["status_done"]}
    failed = {
        str(value).strip().lower()
        for value in lifecycle.get("status_failed", ())
    }
    queued = {
        str(value).strip().lower()
        for value in lifecycle.get("status_queued", ())
    }
    started = monotonic()
    deadline = started + deadline_seconds
    nonqueued_polls = 0

    while True:
        if interrupted is not None and await _call(interrupted):
            cancel_error = await _cancel(
                request,
                lifecycle,
                base_url,
                route,
                task_id,
                request_timeout,
            )
            raise PollInterrupted(
                f"polling interrupted for task {task_id}",
                cancel_error=cancel_error,
            )

        remaining = deadline - monotonic()
        if remaining <= 0:
            cancel_error = await _cancel(
                request,
                lifecycle,
                base_url,
                route,
                task_id,
                request_timeout,
            )
            raise PollDeadlineExceeded(
                f"absolute poll deadline expired for task {task_id}",
                cancel_error=cancel_error,
            )

        bounded_timeout = min(request_timeout, remaining)
        try:
            response = await asyncio.wait_for(
                request(method, url, timeout=bounded_timeout),
                timeout=bounded_timeout,
            )
        except asyncio.CancelledError:
            await _cancel(
                request,
                lifecycle,
                base_url,
                route,
                task_id,
                request_timeout,
            )
            raise
        except TimeoutError as exc:
            if request_timeout >= remaining:
                cancel_error = await _cancel(
                    request,
                    lifecycle,
                    base_url,
                    route,
                    task_id,
                    request_timeout,
                )
                raise PollDeadlineExceeded(
                    f"absolute poll deadline expired for task {task_id}",
                    cancel_error=cancel_error,
                ) from exc
            raise PollRequestTimeout(
                f"poll request timed out for task {task_id}"
            ) from exc
        status = str(
            _path(response, lifecycle["status_path"]) or ""
        ).strip().lower()

        if status in done:
            outputs = _path(response, lifecycle["outputs_path"])
            if outputs is None or outputs == []:
                raise PollOutputMissing(
                    f"task {task_id} completed without required outputs"
                )
            if on_progress is not None:
                await _call(on_progress, 1.0, status)
            return outputs

        if status in failed:
            detail = _path(response, lifecycle["error_path"])
            raise PollFailed(task_id, detail or status)

        elapsed = max(0.0, monotonic() - started)
        if on_progress is not None:
            await _call(
                on_progress,
                min(elapsed / deadline_seconds, 0.99),
                status or "unknown",
            )

        if status not in queued:
            nonqueued_polls += 1
            if (
                max_nonqueued_polls is not None
                and nonqueued_polls >= int(max_nonqueued_polls)
            ):
                cancel_error = await _cancel(
                    request,
                    lifecycle,
                    base_url,
                    route,
                    task_id,
                    request_timeout,
                )
                raise PollAttemptsExceeded(
                    f"non-queued poll budget exhausted for task {task_id}",
                    cancel_error=cancel_error,
                )

        remaining = deadline - monotonic()
        if remaining <= 0:
            continue
        await sleep(min(poll_interval, remaining))


__all__ = [
    "PollAttemptsExceeded",
    "PollDeadlineExceeded",
    "PollEndpointError",
    "PollError",
    "PollFailed",
    "PollInterrupted",
    "PollOutputMissing",
    "PollRequestTimeout",
    "poll_task",
]
