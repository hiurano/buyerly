import hmac
import hashlib
import secrets
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import select, update

from core.config import settings
from database.db import async_session_maker
from database.models import User, WebSession

logger = logging.getLogger(__name__)

SESSION_COOKIE_NAME = "buyerly_session"
CSRF_COOKIE_NAME = "buyerly_csrf"
CSRF_HEADER_NAME = "x-csrf-token"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


def _secret_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _session_max_age(expires_at: datetime) -> int:
    return max(0, int((_as_utc(expires_at) - _utc_now()).total_seconds()))


def set_session_cookies(
    response: Response,
    *,
    token: str,
    csrf_token: Optional[str],
    expires_at: datetime,
) -> None:
    max_age = _session_max_age(expires_at)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=max_age,
        expires=expires_at,
        path="/",
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )
    if csrf_token is not None:
        response.set_cookie(
            CSRF_COOKIE_NAME,
            csrf_token,
            max_age=max_age,
            expires=expires_at,
            path="/",
            secure=settings.SESSION_COOKIE_SECURE,
            httponly=False,
            samesite="strict",
        )


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )
    response.delete_cookie(
        CSRF_COOKIE_NAME,
        path="/",
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=False,
        samesite="strict",
    )


async def create_web_session(
    session,
    *,
    user: User,
    request: Request,
    response: Response,
) -> WebSession:
    now = _utc_now()
    token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    web_session = WebSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        token_hash=_secret_hash(token),
        csrf_hash=_secret_hash(csrf_token),
        user_agent=(request.headers.get("user-agent") or "")[:500],
        ip_address=(request.client.host if request.client and request.client.host else "")[:64],
        created_at=now,
        expires_at=now + timedelta(hours=settings.WEB_SESSION_TTL_HOURS),
        last_seen_at=now,
        rotated_at=now,
    )
    session.add(web_session)
    await session.flush()
    set_session_cookies(
        response,
        token=token,
        csrf_token=csrf_token,
        expires_at=web_session.expires_at,
    )
    return web_session

async def _get_authenticated_user(
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(None),
    x_auth_token: Optional[str] = Header(None),
    dev_user_id: Optional[str] = Query(None, alias="dev_user_id")
) -> User:
    """
    FastAPI dependency that extracts and validates the authenticated user from:
    1. Secure HttpOnly browser session cookie
    2. Temporary legacy Bearer/X-Auth-Token during migration
    3. Dev fallback if enabled
    """
    bearer_token = ""
    if authorization and authorization.startswith("Bearer "):
        bearer_token = authorization[7:].strip()
    elif x_auth_token:
        bearer_token = x_auth_token.strip()

    cookie_token = request.cookies.get(SESSION_COOKIE_NAME, "")
    token = bearer_token or cookie_token
    token_source = "bearer" if bearer_token else "cookie"

    async with async_session_maker() as session:
        # Browser sessions store only token hashes. A legacy User.auth_token is
        # converted to a short-lived server session on its first use.
        if token:
            now = _utc_now()
            web_session = (
                await session.execute(
                    select(WebSession).where(WebSession.token_hash == _secret_hash(token))
                )
            ).scalar_one_or_none()

            user = None
            csrf_token_to_set = None
            if web_session is None and bearer_token:
                user = (
                    await session.execute(
                        select(User)
                        .where(User.auth_token == bearer_token)
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if user is not None:
                    csrf_token_to_set = secrets.token_urlsafe(32)
                    web_session = WebSession(
                        id=str(uuid.uuid4()),
                        user_id=user.id,
                        token_hash=_secret_hash(bearer_token),
                        csrf_hash=_secret_hash(csrf_token_to_set),
                        user_agent=(request.headers.get("user-agent") or "Legacy browser")[:500],
                        ip_address=(request.client.host if request.client and request.client.host else "")[:64],
                        created_at=now,
                        expires_at=now + timedelta(hours=settings.WEB_SESSION_TTL_HOURS),
                        last_seen_at=now,
                        rotated_at=now,
                    )
                    session.add(web_session)
                    user.auth_token = None
                else:
                    web_session = (
                        await session.execute(
                            select(WebSession).where(
                                WebSession.token_hash == _secret_hash(bearer_token)
                            )
                        )
                    ).scalar_one_or_none()

            if web_session is not None:
                if web_session.revoked_at is not None or _as_utc(web_session.expires_at) <= now:
                    web_session = None
                else:
                    if user is None:
                        user = (
                            await session.execute(select(User).where(User.id == web_session.user_id))
                        ).scalar_one_or_none()

            if web_session is not None and user is not None:
                if not user.is_approved:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Your account is awaiting administrator approval."
                    )

                if token_source == "cookie" and request.method.upper() not in _SAFE_METHODS:
                    csrf_token = request.headers.get(CSRF_HEADER_NAME, "")
                    if not csrf_token or not hmac.compare_digest(
                        web_session.csrf_hash,
                        _secret_hash(csrf_token),
                    ):
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="CSRF check failed",
                        )

                rotated_token = None
                if _as_utc(web_session.rotated_at) <= now - timedelta(
                    minutes=settings.WEB_SESSION_ROTATE_MINUTES
                ):
                    candidate_token = secrets.token_urlsafe(32)
                    rotated_id = (
                        await session.execute(
                            update(WebSession)
                            .where(
                                WebSession.id == web_session.id,
                                WebSession.token_hash == _secret_hash(token),
                            )
                            .values(
                                token_hash=_secret_hash(candidate_token),
                                rotated_at=now,
                            )
                            .returning(WebSession.id)
                            .execution_options(synchronize_session=False)
                        )
                    ).scalar_one_or_none()
                    if rotated_id is not None:
                        rotated_token = candidate_token

                if _as_utc(web_session.last_seen_at) <= now - timedelta(minutes=5):
                    web_session.last_seen_at = now

                if token_source == "bearer":
                    csrf_token_to_set = secrets.token_urlsafe(32)
                    web_session.csrf_hash = _secret_hash(csrf_token_to_set)

                await session.commit()
                request.state.web_session_id = web_session.id
                request.state.auth_channel = "browser_session"
                if token_source == "bearer" or rotated_token is not None:
                    set_session_cookies(
                        response,
                        token=rotated_token or token,
                        csrf_token=csrf_token_to_set,
                        expires_at=web_session.expires_at,
                    )
                return user

        # Strict Authentication Requirement (Production)
        if not settings.ENABLE_DEV_AUTH:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sign-in is required"
            )

        # Dev / Local preview fallback (ONLY active when ENABLE_DEV_AUTH=True)
        target_tg_id = dev_user_id or str(settings.ADMIN_CHAT_ID)
        if target_tg_id:
            res = await session.execute(select(User).where(User.telegram_id == target_tg_id))
            user = res.scalar_one_or_none()
            if user and user.is_approved:
                return user

        # If no users exist yet in dev mode, check for any approved admin or create default
        res = await session.execute(select(User).where(User.is_approved == True).limit(1))
        any_user = res.scalar_one_or_none()
        if any_user:
            return any_user

        # Create fallback superadmin if DB is empty in dev mode
        fallback_id = str(settings.ADMIN_CHAT_ID) or "123456789"
        fallback_user = User(
            telegram_id=fallback_id,
            username="admin",
            full_name="Administrator",
            role="admin",
            is_approved=True
        )
        session.add(fallback_user)
        await session.commit()
        await session.refresh(fallback_user)
        return fallback_user


async def get_current_user(
    user: User = Depends(_get_authenticated_user),
    x_workspace_slug: Optional[str] = Header(None),
) -> User:
    """Bind browser requests to their route without changing other tabs' scope."""
    if x_workspace_slug is not None:
        from api.deps import get_user_workspace

        if not x_workspace_slug.strip():
            raise HTTPException(status_code=403, detail="Workspace access denied")
        async with async_session_maker() as session:
            workspace = await get_user_workspace(session, user, slug=x_workspace_slug)
            if workspace is None:
                raise HTTPException(status_code=403, detail="Workspace access denied")
            # Authentication returns a detached User. Keep this scope request-local.
            user.active_workspace_id = workspace.id
    return user
