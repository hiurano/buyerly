"""Forwarding to the TypeScript server while the backend moves to it (#611).

Cloudflare's tunnel sends every request to this API. Paths the TypeScript
server already owns (settings.SERVER_PATHS) are passed on to it unchanged,
before this app's own routes see them; moving an area back is removing its
prefix. WebSockets on those paths (the sync stream) are forwarded too,
frame by frame (SocketForwarder). Once every area has moved, the tunnel points at the TypeScript server
and this module goes away.
"""

import asyncio
import logging
from contextlib import suppress

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask
from starlette.types import ASGIApp, Receive, Scope, Send
from websockets.asyncio.client import connect as websocket_connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

from core.config import settings

logger = logging.getLogger(__name__)

# Per-connection headers (RFC 9110 §7.6.1) belong to one hop, not the next.
_HOP_HEADERS = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    }
)
# httpx sets these for the forwarded request itself. The response keeps its
# Content-Length: its body is passed on byte for byte, still encoded.
_REQUEST_SKIP = _HOP_HEADERS | {"host", "content-length"}
# The WebSocket handshake of the next hop is its own.
_SOCKET_SKIP = _HOP_HEADERS | {
    "host",
    "user-agent",
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-protocol",
}


def owned_prefixes(paths: str) -> tuple[str, ...]:
    """The configured prefixes; each must start with "/" and end with "/"."""
    prefixes = []
    for raw in paths.split(","):
        prefix = raw.strip()
        if not prefix:
            continue
        if not prefix.startswith("/") or not prefix.endswith("/"):
            raise ValueError(f"SERVER_PATHS entry must start and end with '/': {prefix!r}")
        prefixes.append(prefix)
    return tuple(prefixes)


def _owned(path: str, prefixes: tuple[str, ...]) -> bool:
    # "/health/server" itself belongs too, not only what is under it.
    return any(path.startswith(prefix) or path == prefix[:-1] for prefix in prefixes)


class SocketForwarder:
    """WebSockets on owned paths (the sync stream, /api/sync/ws) go to the server, frame by frame.

    HTTP middleware never sees a WebSocket, so this one wraps the app as ASGI. The browser's
    handshake is answered with the server's: its Set-Cookie on the accept, its refusal (an HTTP
    status before the upgrade) as a refusal, its close code and reason as the close.
    """

    def __init__(self, app: ASGIApp, base_url: str, prefixes: tuple[str, ...]):
        self.app = app
        self.base_url = "ws" + base_url.removeprefix("http")
        self.prefixes = prefixes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "websocket" or not _owned(scope["path"], self.prefixes):
            await self.app(scope, receive, send)
            return
        await forward_socket(scope, receive, send, self.base_url)


def _socket_headers(scope: Scope) -> list[tuple[str, str]]:
    headers = [
        (k.decode("latin-1"), v.decode("latin-1"))
        for k, v in scope["headers"]
        if k.decode("latin-1").lower() not in _SOCKET_SKIP
    ]
    for k, v in scope["headers"]:
        name = k.decode("latin-1").lower()
        if name == "user-agent":
            headers.append(("User-Agent", v.decode("latin-1")))
        elif name == "host":
            # The server checks a page's Origin against the host the browser asked for.
            headers.append(("X-Forwarded-Host", v.decode("latin-1")))
    if scope.get("client"):
        headers.append(("X-Forwarded-For", scope["client"][0]))
    headers.append(("X-Forwarded-Proto", "https" if scope.get("scheme") == "wss" else "http"))
    return headers


async def _refuse(scope: Scope, send: Send, status: int, body: bytes) -> None:
    # A 403 is what a close before the accept gives anyway, as the API's own
    # socket refuses another site's page. uvicorn logs "returned without
    # completing handshake" after an http.response, so it is kept for the rest.
    if status != 403 and "websocket.http.response" in (scope.get("extensions") or {}):
        await send({
            "type": "websocket.http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        })
        await send({"type": "websocket.http.response.body", "body": body})
    else:
        # A close before the accept: the server answers the handshake with 403.
        await send({"type": "websocket.close", "code": 1008})


async def forward_socket(scope: Scope, receive: Receive, send: Send, base_url: str) -> None:
    message = await receive()
    if message["type"] != "websocket.connect":
        return
    query = scope.get("query_string", b"").decode("latin-1")
    url = f"{base_url}{scope['path']}" + (f"?{query}" if query else "")
    try:
        upstream = await websocket_connect(
            url,
            additional_headers=_socket_headers(scope),
            user_agent_header=None,
            compression=None,
            proxy=None,
            # The stream has its own heartbeat; the browser's pings and closes are passed on.
            ping_interval=None,
            max_size=None,
            open_timeout=10,
        )
    except InvalidStatus as refusal:
        response = refusal.response
        await _refuse(scope, send, response.status_code, bytes(response.body or b""))
        return
    except Exception as exc:  # noqa: BLE001 - any failure to reach the server is the same 502
        # The path only: the query string carries the account and workspace.
        logger.error("TypeScript server unreachable for WS %s: %s", scope["path"], type(exc).__name__)
        await _refuse(scope, send, 502, b'{"detail":"Service unavailable"}')
        return

    cookies = [(b"set-cookie", value.encode("latin-1")) for value in upstream.response.headers.get_all("set-cookie")]
    await send({"type": "websocket.accept", "headers": cookies})

    async def from_browser() -> None:
        while True:
            message = await receive()
            if message["type"] == "websocket.disconnect":
                code = message.get("code") or 1000
                await upstream.close(code if code not in (1005, 1006) else 1000)
                return
            if message.get("text") is not None:
                await upstream.send(message["text"])
            elif message.get("bytes") is not None:
                await upstream.send(message["bytes"])

    async def from_server() -> None:
        try:
            async for frame in upstream:
                if isinstance(frame, str):
                    await send({"type": "websocket.send", "text": frame})
                else:
                    await send({"type": "websocket.send", "bytes": frame})
        except ConnectionClosed:
            pass
        code = upstream.close_code
        # 1005 (no code) and 1006 (dropped) cannot be sent; the browser reconnects after either.
        await send({
            "type": "websocket.close",
            "code": code if code and code not in (1005, 1006) else 1011,
            "reason": upstream.close_reason or "",
        })

    browser = asyncio.create_task(from_browser())
    server = asyncio.create_task(from_server())
    try:
        await asyncio.wait({browser, server}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in (browser, server):
            task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await task
        with suppress(Exception):
            await upstream.close()


def install(app: FastAPI, base_url: str | None = None, paths: str | None = None,
            transport: httpx.AsyncBaseTransport | None = None) -> None:
    """Forward the owned paths to the TypeScript server; nothing when unset."""
    base_url = (settings.SERVER_URL if base_url is None else base_url).rstrip("/")
    prefixes = owned_prefixes(settings.SERVER_PATHS if paths is None else paths)
    if not base_url or not prefixes:
        return
    app.add_middleware(SocketForwarder, base_url=base_url, prefixes=prefixes)

    def client() -> httpx.AsyncClient:
        # Made on first use, so an app that runs its lifespan again (tests)
        # does not reuse the client close() shut.
        current = getattr(app.state, "server_proxy_client", None)
        if current is None:
            current = httpx.AsyncClient(
                base_url=base_url,
                transport=transport,
                timeout=httpx.Timeout(30.0, connect=3.0),
                follow_redirects=False,
            )
            app.state.server_proxy_client = current
        return current

    @app.middleware("http")
    async def forward_to_server(request: Request, call_next):
        if not _owned(request.url.path, prefixes):
            return await call_next(request)
        upstream_client = client()
        headers = [(k, v) for k, v in request.headers.items() if k.lower() not in _REQUEST_SKIP]
        if request.client:
            headers.append(("x-forwarded-for", request.client.host))
        headers.append(("x-forwarded-proto", request.url.scheme))
        upstream_request = upstream_client.build_request(
            request.method,
            request.url.path,
            params=request.url.query or None,
            headers=headers,
            # Whole, not streamed: a request body cannot be streamed out of
            # FastAPI's http middleware. The API caps bodies at 6 MB anyway.
            content=await request.body(),
        )
        try:
            upstream = await upstream_client.send(upstream_request, stream=True)
        except httpx.HTTPError as exc:
            # The path only: a query string may carry a token.
            logger.error("TypeScript server unreachable for %s %s: %s",
                         request.method, request.url.path, type(exc).__name__)
            return JSONResponse(status_code=502, content={"detail": "Service unavailable"})
        response_headers = [
            (k, v) for k, v in upstream.headers.multi_items() if k.lower() not in _HOP_HEADERS
        ]
        response = StreamingResponse(
            upstream.aiter_raw(),
            status_code=upstream.status_code,
            background=BackgroundTask(upstream.aclose),
        )
        # Replace Starlette's defaults; keep repeated headers such as Set-Cookie.
        response.raw_headers = [(k.encode("latin-1"), v.encode("latin-1")) for k, v in response_headers]
        return response


async def close(app: FastAPI) -> None:
    client = getattr(app.state, "server_proxy_client", None)
    if client is not None:
        await client.aclose()
        app.state.server_proxy_client = None
