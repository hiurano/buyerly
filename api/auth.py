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
from core.rate_limit import get_client_ip
from database.db import async_session_maker
from database.models import User, WebSession

logger = logging.getLogger(__name__)

SESSION_COOKIE_NAME = "buyerly_session"
CSRF_COOKIE_NAME = "buyerly_csrf"
CSRF_HEADER_NAME = "x-csrf-token"
# Linear's "Add an account…": one browser keeps a session per account, each in
# its own cookie slot. Slot 0 is the historical cookie pair; slot N adds "_N".
# The browser names the account a request acts as by its user id; the server
# never falls back to another account's session when that one is signed out.
ACCOUNT_HEADER_NAME = "x-buyerly-account"
MAX_BROWSER_ACCOUNTS = 5
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


def session_cookie_name(slot: int) -> str:
    return SESSION_COOKIE_NAME if slot == 0 else f"{SESSION_COOKIE_NAME}_{slot}"


def csrf_cookie_name(slot: int) -> str:
    return CSRF_COOKIE_NAME if slot == 0 else f"{CSRF_COOKIE_NAME}_{slot}"


def session_cookie_tokens(request: Request) -> list[tuple[int, str]]:
    """Every session cookie this browser sent, as (slot, token), in slot order."""
    found = []
    for slot in range(MAX_BROWSER_ACCOUNTS):
        token = (request.cookies.get(session_cookie_name(slot)) or "").strip()
        if token:
            found.append((slot, token))
    return found


def requested_account_id(request: Request) -> Optional[int]:
    """The account the browser asks to act as; a malformed value is refused."""
    raw = (request.headers.get(ACCOUNT_HEADER_NAME) or "").strip()
    if not raw:
        return None
    if not raw.isdigit() or len(raw) > 18:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign-in is required")
    return int(raw)


async def live_browser_sessions(session, request: Request) -> list[tuple[int, str, WebSession]]:
    """This browser's unexpired, unrevoked sessions as (slot, token, session)."""
    slots = session_cookie_tokens(request)
    if not slots:
        return []
    hashes = {_secret_hash(token): (slot, token) for slot, token in slots}
    now = _utc_now()
    rows = (
        await session.execute(
            select(WebSession).where(
                WebSession.token_hash.in_(list(hashes)),
                WebSession.revoked_at.is_(None),
            )
        )
    ).scalars().all()
    live = [
        (*hashes[row.token_hash], row)
        for row in rows
        if _as_utc(row.expires_at) > now
    ]
    return sorted(live, key=lambda item: item[0])


def _secret_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _client_ip(request: Request) -> str:
    """The browser's address behind trusted proxies, not the proxy's own."""
    ip_value = get_client_ip(request)
    return "" if ip_value == "unknown" else ip_value[:64]


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
    slot: int = 0,
) -> None:
    max_age = _session_max_age(expires_at)
    response.set_cookie(
        session_cookie_name(slot),
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
            csrf_cookie_name(slot),
            csrf_token,
            max_age=max_age,
            expires=expires_at,
            path="/",
            secure=settings.SESSION_COOKIE_SECURE,
            httponly=False,
            samesite="strict",
        )


def clear_session_cookies(response: Response, slot: int = 0) -> None:
    response.delete_cookie(
        session_cookie_name(slot),
        path="/",
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )
    response.delete_cookie(
        csrf_cookie_name(slot),
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
    """Sign the user in next to the browser's other accounts.

    Signing in again as an account already in this browser replaces its slot;
    a new account takes the first free slot, and other accounts stay signed in.
    """
    now = _utc_now()
    live = await live_browser_sessions(session, request)
    same_account = next((item for item in live if item[2].user_id == user.id), None)
    if same_account is not None:
        slot = same_account[0]
        same_account[2].revoked_at = now
    else:
        taken = {item[0] for item in live}
        free = [candidate for candidate in range(MAX_BROWSER_ACCOUNTS) if candidate not in taken]
        if not free:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"This browser is already logged in to {MAX_BROWSER_ACCOUNTS} accounts. "
                    "Log out of one to add another."
                ),
            )
        slot = free[0]
    token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    web_session = WebSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        token_hash=_secret_hash(token),
        csrf_hash=_secret_hash(csrf_token),
        user_agent=(request.headers.get("user-agent") or "")[:500],
        ip_address=_client_ip(request),
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
        slot=slot,
    )
    return web_session

async def get_authenticated_user(
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

    token_source = "bearer" if bearer_token else "cookie"
    requested_user_id = requested_account_id(request)

    async with async_session_maker() as session:
        # A browser may hold one session per account (Linear's "Add an
        # account…"). The account header picks which one acts; without it the
        # newest sign-in acts, as when a login used to replace the cookie.
        token = bearer_token
        slot = 0
        if not bearer_token:
            cookie_slots = session_cookie_tokens(request)
            if len(cookie_slots) == 1 and requested_user_id is None:
                slot, token = cookie_slots[0]
            elif cookie_slots:
                live = await live_browser_sessions(session, request)
                if requested_user_id is not None:
                    chosen = next((item for item in live if item[2].user_id == requested_user_id), None)
                else:
                    chosen = max(live, key=lambda item: _as_utc(item[2].created_at), default=None)
                if chosen is not None:
                    slot, token = chosen[0], chosen[1]
            if requested_user_id is not None and not token:
                # Never fall back to another account's session (or dev auth):
                # a stale tab must not act as whoever else is signed in.
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="This account is no longer logged in",
                )

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
                        ip_address=_client_ip(request),
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
                if requested_user_id is not None and user.id != requested_user_id:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="This account is no longer logged in",
                    )
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

                # Linear shows where a session was last seen, so the address follows it.
                if _as_utc(web_session.last_seen_at) <= now - timedelta(minutes=5):
                    web_session.last_seen_at = now
                    web_session.ip_address = _client_ip(request) or web_session.ip_address

                if token_source == "bearer":
                    csrf_token_to_set = secrets.token_urlsafe(32)
                    web_session.csrf_hash = _secret_hash(csrf_token_to_set)

                await session.commit()
                request.state.web_session_id = web_session.id
                request.state.web_session_slot = slot
                request.state.auth_channel = "browser_session"
                if token_source == "bearer" or rotated_token is not None:
                    set_session_cookies(
                        response,
                        token=rotated_token or token,
                        csrf_token=csrf_token_to_set,
                        expires_at=web_session.expires_at,
                        slot=slot,
                    )
                return user

        # Strict Authentication Requirement (Production)
        if not settings.ENABLE_DEV_AUTH or requested_user_id is not None:
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
    user: User = Depends(get_authenticated_user),
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
