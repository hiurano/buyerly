"""Forwarding to the TypeScript server while the backend moves to it (#611).

Cloudflare's tunnel sends every request to this API. Paths the TypeScript
server already owns (settings.SERVER_PATHS) are passed on to it unchanged,
before this app's own routes see them; moving an area back is removing its
prefix. Once every area has moved, the tunnel points at the TypeScript server
and this module goes away.
"""

import logging

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

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


def install(app: FastAPI, base_url: str | None = None, paths: str | None = None,
            transport: httpx.AsyncBaseTransport | None = None) -> None:
    """Forward the owned paths to the TypeScript server; nothing when unset."""
    base_url = (settings.SERVER_URL if base_url is None else base_url).rstrip("/")
    prefixes = owned_prefixes(settings.SERVER_PATHS if paths is None else paths)
    if not base_url or not prefixes:
        return

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
