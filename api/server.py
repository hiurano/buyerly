import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from api.routes import router as api_router
from api.meta_oauth import router as meta_oauth_router
from core.config import settings
from core.rate_limit import limiter
from core.workspace_slugs import RESERVED_WORKSPACE_SLUGS
from database.db import async_session_maker
from services.image_uploads import cleanup_stale_workspace_logos

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with async_session_maker() as session:
            removed = await cleanup_stale_workspace_logos(session)
        if removed:
            logger.info("Removed %s stale workspace logo uploads", removed)
    except Exception:
        logger.exception("Failed to clean stale workspace logo uploads")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Buyerly Web App & API",
        version="1.0.0",
        description="FastAPI Backend & Telegram Mini App for Buyerly AI Media Buyer",
        lifespan=lifespan,
    )

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
                        content={"detail": "Размер тела запроса превышает допустимый лимит."},
                    )
            except ValueError:
                pass

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        if request.url.path.startswith("/static/") or request.url.path == "/":
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
            if not await limiter.ready():
                raise RuntimeError("rate-limit backend is unavailable")
        except Exception:
            logger.exception("Readiness dependency check failed")
            return JSONResponse(
                status_code=503,
                content={"status": "not_ready", "version": settings.APP_VERSION},
            )
        return {"status": "ready", "version": settings.APP_VERSION}

    if not settings.SERVE_STATIC:
        return app

    # Built React application for local single-process development. Production
    # serves the same files through the dedicated frontend container.
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frontend_dir = os.path.join(project_dir, "frontend", "dist")
    webapp_dir = os.path.join(project_dir, "webapp")
    uploads_dir = os.path.join(webapp_dir, "uploads")
    os.makedirs(os.path.join(uploads_dir, "avatars"), exist_ok=True)
    os.makedirs(os.path.join(uploads_dir, "workspaces"), exist_ok=True)

    assets_dir = os.path.join(frontend_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

    public_documents = {
        "/privacy": "privacy.html",
        "/terms": "terms.html",
        "/data-deletion": "data-deletion.html",
    }

    @app.get("/privacy", include_in_schema=False)
    @app.get("/terms", include_in_schema=False)
    @app.get("/data-deletion", include_in_schema=False)
    async def serve_public_document(request: Request):
        document_path = os.path.join(webapp_dir, public_documents[request.url.path])
        if os.path.exists(document_path):
            return FileResponse(
                document_path,
                headers={"Cache-Control": "public, max-age=300"},
            )
        return JSONResponse(status_code=404, content={"detail": "Document not found"})

    @app.get("/")
    @app.get("/login")
    @app.get("/auth/email/verify")
    @app.get("/create-workspace")
    @app.get("/invite/{token}")
    @app.get("/connect/meta/{token}")
    @app.get("/connect/meta/success")
    @app.get("/{workspace_slug}/welcome")
    @app.get("/{workspace_slug}/inbox")
    @app.get("/{workspace_slug}/inbox/{item_id}")
    @app.get("/{workspace_slug}/ads/{entity_type}")
    @app.get("/{workspace_slug}/ads/{entity_type}/{entity_id}")
    @app.get("/{workspace_slug}/rules")
    @app.get("/{workspace_slug}/rules/{rule_id}")
    @app.get("/{workspace_slug}/statistics")
    @app.get("/{workspace_slug}/settings")
    @app.get("/{workspace_slug}")
    async def serve_index(request: Request):
        path_parts = [part for part in request.url.path.split("/") if part]
        public_entrypoints = {
            "/",
            "/login",
            "/auth/email/verify",
            "/create-workspace",
        }
        is_invite = len(path_parts) == 2 and path_parts[0] == "invite"
        is_meta_invite = len(path_parts) == 3 and path_parts[:2] == ["connect", "meta"]
        is_workspace_route = bool(path_parts) and path_parts[0] not in RESERVED_WORKSPACE_SLUGS
        if request.url.path not in public_entrypoints and not is_invite and not is_meta_invite and not is_workspace_route:
            return JSONResponse(status_code=404, content={"detail": "Page not found"})
        index_path = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path, headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            })
        return {"status": "Buyerly API is running", "webapp": "index.html not found"}

    return app

app = create_app()
