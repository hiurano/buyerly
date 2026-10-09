import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.routes import router as api_router
from api.meta_oauth import router as meta_oauth_router
from core import telegram
from core.config import settings
from core.workspace_slugs import RESERVED_WORKSPACE_SLUGS
from database.db import async_session_maker
from services import worker_watchdog
from services.image_uploads import UPLOADS_ROOT, cleanup_stale_workspace_logos
from meta_api.client import MetaClient
from services.inventory_cache import PostgreSQLInventoryCache

logger = logging.getLogger(__name__)


class _ImmutableStaticFiles(StaticFiles):
    """User uploads get a new name on every change, so browsers may keep them."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # A second lifespan on the same app must not reuse its closed client.
    if app.state.meta_client is None:
        app.state.meta_client = _create_meta_client()
    client = app.state.meta_client
    # Independent of the worker, so a stalled worker still gets reported (#199).
    watchdog = asyncio.create_task(worker_watchdog.run_forever())
    try:
        try:
            async with async_session_maker() as session:
                removed = await cleanup_stale_workspace_logos(session)
            if removed:
                logger.info("Removed %s stale workspace logo uploads", removed)
        except Exception:
            logger.exception("Failed to clean stale workspace logo uploads")
        # Telegram calls the bot back here; a failure only delays linking.
        webhook = asyncio.create_task(telegram.register_webhook())
        yield
        webhook.cancel()
    finally:
        watchdog.cancel()
        with suppress(asyncio.CancelledError):
            await watchdog
        app.state.meta_client = None
        await client.aclose()


def _create_meta_client() -> MetaClient:
    return MetaClient(cache_provider=PostgreSQLInventoryCache(session_factory=async_session_maker))


def create_app() -> FastAPI:
    app = FastAPI(
        title="Buyerly Web App & API",
        version="1.0.0",
        description="FastAPI backend for Buyerly AI Media Buyer",
        lifespan=lifespan,
    )
    # MetaClient opens HTTP connections lazily. Assembly itself performs no I/O.
    app.state.meta_client = _create_meta_client()

    # Security, payload size limit, and caching headers middleware
    @app.middleware("http")
    async def add_security_and_cache_headers(request: Request, call_next):
        # Enforce request body size limits to prevent memory exhaustion DoS
        content_length_header = request.headers.get("content-length")
        if content_length_header and request.url.path.startswith("/api/"):
            try:
                content_length = int(content_length_header)
                is_upload_route = request.url.path in (
                    "/api/onboarding/avatar",
                    "/api/onboarding/workspace/logo",
                )
                max_allowed_bytes = (6 * 1024 * 1024) if is_upload_route else (1024 * 1024)
                if content_length > max_allowed_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "The request body exceeds the allowed size limit."},
                    )
            except ValueError:
                pass

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Public HTML owns its cache policy; `/` is now a static landing page.
        if request.url.path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    # CORS support
    cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # API routes
    app.include_router(api_router)
    app.include_router(meta_oauth_router)

    @app.get("/health/live", include_in_schema=False)
    async def health_live():
        return {"status": "alive", "version": settings.APP_VERSION}

    @app.get("/health/ready", include_in_schema=False)
    async def health_ready():
        try:
            async with async_session_maker() as session:
                await session.execute(text("SELECT 1"))
        except Exception:
            logger.exception("Readiness dependency check failed")
            return JSONResponse(
                status_code=503,
                content={"status": "not_ready", "version": settings.APP_VERSION},
            )
        return {"status": "ready", "version": settings.APP_VERSION}

    # Freshness of the worker's actual work, for an external uptime monitor:
    # 503 once no monitoring cycle has finished for CRITICAL_LAG_SECONDS, even
    # if the worker process and its heartbeat are alive (#199). Readiness
    # stays about this API's own dependencies.
    @app.get("/health/worker", include_in_schema=False)
    async def health_worker():
        try:
            async with async_session_maker() as session:
                cycle = await worker_watchdog.read_cycle_status(session)
        except Exception:
            logger.exception("Worker freshness check failed")
            return JSONResponse(status_code=503, content={"status": "unavailable"})
        body = {
            "status": cycle["status"],
            "lag_seconds": cycle["lag_seconds"],
            "warning_seconds": worker_watchdog.WARNING_LAG_SECONDS,
            "critical_seconds": worker_watchdog.CRITICAL_LAG_SECONDS,
        }
        return JSONResponse(status_code=503 if cycle["status"] == "critical" else 200, content=body)

    if not settings.SERVE_STATIC:
        return app

    # The built React application, the public pages and user uploads. The API
    # process serves them itself, so production needs no separate web server.
    frontend_dir = Path(__file__).resolve().parents[1] / "frontend" / "dist"
    uploads_dir = Path(UPLOADS_ROOT)
    (uploads_dir / "avatars").mkdir(parents=True, exist_ok=True)
    (uploads_dir / "workspaces").mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", _ImmutableStaticFiles(directory=str(uploads_dir)), name="uploads")

    public_documents = {
        "/": "landing.html",
        "/about": "about.html",
        "/privacy": "privacy.html",
        "/terms": "terms.html",
        "/data-deletion": "data-deletion.html",
    }

    @app.get("/", include_in_schema=False)
    @app.get("/about", include_in_schema=False)
    @app.get("/privacy", include_in_schema=False)
    @app.get("/terms", include_in_schema=False)
    @app.get("/data-deletion", include_in_schema=False)
    async def serve_public_document(request: Request):
        document_path = frontend_dir / public_documents[request.url.path]
        if document_path.is_file():
            return FileResponse(
                document_path,
                headers={"Cache-Control": "public, max-age=300"},
            )
        return JSONResponse(status_code=404, content={"detail": "Document not found"})

    # Root segments the React app routes itself (frontend/src/lib/routing.ts);
    # every other reserved root belongs to the server.
    app_roots = {"login", "auth", "create-workspace", "invite", "connect"}

    @app.exception_handler(404)
    async def serve_frontend_file_or_app(request: Request, exc: StarletteHTTPException):
        """Built files, then the React app for its own addresses; API 404s stay as they are."""
        if request.method not in ("GET", "HEAD"):
            return await http_exception_handler(request, exc)
        path = request.url.path.lstrip("/")
        candidate = (frontend_dir / path).resolve()
        if path and candidate.is_relative_to(frontend_dir.resolve()) and candidate.is_file():
            cache = (
                "public, max-age=31536000, immutable"
                if path.startswith("assets/")
                else "public, max-age=300"
            )
            return FileResponse(candidate, headers={"Cache-Control": cache})
        root = path.split("/", 1)[0]
        if not root or (root in RESERVED_WORKSPACE_SLUGS and root not in app_roots):
            return await http_exception_handler(request, exc)
        index_path = frontend_dir / "index.html"
        if not index_path.is_file():
            return await http_exception_handler(request, exc)
        return FileResponse(index_path, headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        })

    return app

app = create_app()
