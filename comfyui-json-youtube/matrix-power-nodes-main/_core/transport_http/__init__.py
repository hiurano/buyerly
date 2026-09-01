"""Async HTTP transport shared by provider-backed nodes."""

import asyncio
from dataclasses import dataclass
import time

import aiohttp

from ..errors_taxonomy import EmptyOrMalformedSuccessError
from ..errors_taxonomy import IndeterminateSubmitError
from ..errors_taxonomy import LocalValidationError
from ..errors_taxonomy import TimeoutOrInterruptedError, failure_from_http
from ..errors_taxonomy import TransientTransportOrServerError


READ_RETRY_DELAYS = (1.0, 2.0)


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: dict
    body: bytes


def _default_interrupt():
    try:
        from comfy.model_management import throw_exception_if_processing_interrupted
    except ImportError:
        return
    throw_exception_if_processing_interrupted()


async def _await_interruptibly(
    awaitable,
    *,
    deadline,
    request_deadline,
    interrupt,
    indeterminate_on_interrupt=False,
):
    task = asyncio.ensure_future(awaitable)
    try:
        while True:
            try:
                interrupt()
            except BaseException as exc:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
                if indeterminate_on_interrupt:
                    raise IndeterminateSubmitError(
                        "billable submit was interrupted after its request started"
                    ) from exc
                raise
            now = time.monotonic()
            remaining = min(deadline, request_deadline) - now
            if remaining <= 0:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
                reason = "operation_deadline" if deadline <= request_deadline else "request_timeout"
                raise TimeoutOrInterruptedError(
                    f"{reason.replace('_', ' ')} expired",
                    reason=reason,
                )
            done, _ = await asyncio.wait((task,), timeout=min(1.0, remaining))
            if done:
                return await task
    except asyncio.CancelledError:
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        raise


async def _read_body(
    response,
    *,
    deadline,
    request_deadline,
    interrupt,
    indeterminate_on_interrupt=False,
):
    chunks = []
    iterator = response.content.iter_chunked(64 * 1024).__aiter__()
    while True:
        try:
            chunk = await _await_interruptibly(
                iterator.__anext__(),
                deadline=deadline,
                request_deadline=request_deadline,
                interrupt=interrupt,
                indeterminate_on_interrupt=indeterminate_on_interrupt,
            )
        except StopAsyncIteration:
            return b"".join(chunks)
        chunks.append(chunk)


async def _backoff(seconds, *, deadline, interrupt):
    await _await_interruptibly(
        asyncio.sleep(seconds),
        deadline=deadline,
        request_deadline=deadline,
        interrupt=interrupt,
    )


async def request(
    method,
    url,
    *,
    deadline,
    request_timeout,
    headers=None,
    json=None,
    data=None,
    interrupt=None,
    billable_submit=False,
):
    """Perform one asynchronous HTTP operation."""
    if time.monotonic() >= deadline:
        raise TimeoutOrInterruptedError(
            "operation deadline expired before the request",
            reason="operation_deadline",
        )
    interrupt = interrupt or _default_interrupt
    interrupt()
    timeout = aiohttp.ClientTimeout(total=float(request_timeout))
    method = str(method).upper()
    uncertain_post = bool(billable_submit and method == "POST")
    async with aiohttp.ClientSession() as session:
        retry_delays = iter(READ_RETRY_DELAYS if method == "GET" else ())
        while True:
            request_deadline = time.monotonic() + float(request_timeout)
            try:
                response = await _await_interruptibly(
                    session.request(
                        method,
                        url,
                        headers=headers,
                        json=json,
                        data=data,
                        timeout=timeout,
                    ),
                    deadline=deadline,
                    request_deadline=request_deadline,
                    interrupt=interrupt,
                    indeterminate_on_interrupt=uncertain_post,
                )
            except TimeoutOrInterruptedError as exc:
                if exc.reason != "request_timeout":
                    raise
                failure = (
                    IndeterminateSubmitError(
                        "billable submit timed out after its request started"
                    )
                    if uncertain_post
                    else exc
                )
            except asyncio.CancelledError as exc:
                if not uncertain_post:
                    raise
                failure = IndeterminateSubmitError(
                    "billable submit was cancelled after its request started"
                )
                failure.__cause__ = exc
            except aiohttp.InvalidURL as exc:
                failure = LocalValidationError(
                    f"request URL is invalid: {type(exc).__name__}"
                )
            except aiohttp.ClientConnectorError as exc:
                failure = TransientTransportOrServerError(
                    f"connection failed before request write: {type(exc).__name__}"
                )
            except (aiohttp.ClientError, OSError) as exc:
                failure = (
                    IndeterminateSubmitError(
                        "billable submit lost its response after request start"
                    )
                    if uncertain_post
                    else TransientTransportOrServerError(
                        f"transport failed: {type(exc).__name__}"
                    )
                )
            else:
                try:
                    try:
                        body = await _read_body(
                            response,
                            deadline=deadline,
                            request_deadline=request_deadline,
                            interrupt=interrupt,
                            indeterminate_on_interrupt=(
                                uncertain_post and response.status < 400
                            ),
                        )
                    except TimeoutOrInterruptedError as exc:
                        if exc.reason != "request_timeout":
                            raise
                        if response.status >= 400:
                            failure = failure_from_http(response.status)
                        elif uncertain_post:
                            failure = IndeterminateSubmitError(
                                "billable submit response body timed out"
                            )
                        else:
                            failure = exc
                    except asyncio.CancelledError as exc:
                        if not uncertain_post or response.status >= 400:
                            raise
                        failure = IndeterminateSubmitError(
                            "billable submit response body was cancelled"
                        )
                        failure.__cause__ = exc
                    except (aiohttp.ClientError, OSError) as exc:
                        if response.status >= 400:
                            failure = failure_from_http(response.status)
                        elif uncertain_post:
                            failure = IndeterminateSubmitError(
                                "billable submit response body was lost"
                            )
                        else:
                            failure = TransientTransportOrServerError(
                                f"transfer failed: {type(exc).__name__}"
                            )
                    else:
                        if response.status >= 400:
                            failure = failure_from_http(
                                response.status,
                                body[:300].decode("utf-8", errors="replace"),
                            )
                        else:
                            return HttpResponse(response.status, dict(response.headers), body)
                finally:
                    response.release()
            if method != "GET" or not failure.retryable:
                raise failure
            try:
                delay = next(retry_delays)
            except StopIteration:
                raise failure
            await _backoff(delay, deadline=deadline, interrupt=interrupt)


async def download(url, *, deadline, request_timeout, interrupt=None):
    """Download provider output without forwarding provider credentials."""
    response = await request(
        "GET",
        url,
        deadline=deadline,
        request_timeout=request_timeout,
        interrupt=interrupt,
    )
    if not response.body:
        raise EmptyOrMalformedSuccessError("provider output download was empty")
    return response.body
