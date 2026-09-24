import os
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.ext.asyncio import create_async_engine


def _validate_test_db_url(value):
    """Allow only the local disposable CI database, never a runtime fallback."""
    error = "Test database refused: use the local buyerly_test database and set TEST_DATABASE_DISPOSABLE=buyerly_test"
    try:
        url = make_url(value)
        allowed = (
            url.drivername == "postgresql+asyncpg"
            and url.host in {"localhost", "127.0.0.1", "::1"}
            and url.port in {None, 5432}
            and url.username == "buyerly"
            and url.database == "buyerly_test"
            and not url.query
            and os.getenv("TEST_DATABASE_DISPOSABLE") == "buyerly_test"
        )
    except (TypeError, ValueError, ArgumentError):
        # Parser errors can contain credentials. Do not propagate their text.
        raise RuntimeError(error) from None
    if not allowed:
        raise RuntimeError(error)
    return url


def get_test_db_url() -> str:
    value = os.getenv("TEST_DATABASE_URL", "")
    _validate_test_db_url(value)
    return value


def create_test_engine():
    return create_async_engine(get_test_db_url(), echo=False)


async def init_test_db(engine):
    # Recheck the actual engine before begin(), including callers bypassing
    # create_test_engine or an environment changed since engine creation.
    expected = make_url(get_test_db_url())
    actual = _validate_test_db_url(engine.url)
    if actual != expected:
        raise RuntimeError("Test database refused: engine does not match TEST_DATABASE_URL")
    from database.db import Base

    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.run_sync(Base.metadata.create_all)


async def session_headers(session_maker, telegram_user: dict) -> dict:
    """Browser-session headers for a test user keyed by legacy telegram_id.

    Creates the user when missing, with the rules the retired Telegram Mini App
    sign-in used (the configured ADMIN_CHAT_ID becomes an approved admin, anyone
    else an unapproved buyer), then opens a real web session. The returned
    cookie and CSRF headers go through the production session check.
    """
    import secrets
    import uuid
    from datetime import timedelta

    from sqlalchemy import select

    from api.auth import CSRF_HEADER_NAME, SESSION_COOKIE_NAME, _secret_hash, _utc_now
    from core.config import settings
    from database.models import User, WebSession

    telegram_id = str(int(telegram_user["id"]))
    token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    now = _utc_now()
    async with session_maker() as session:
        user = (
            await session.execute(select(User).where(User.telegram_id == telegram_id))
        ).scalar_one_or_none()
        if user is None:
            is_super_admin = telegram_id == str(settings.ADMIN_CHAT_ID)
            full_name = " ".join(
                part
                for part in (telegram_user.get("first_name", ""), telegram_user.get("last_name", ""))
                if part
            )
            user = User(
                telegram_id=telegram_id,
                username=telegram_user.get("username") or f"user_{telegram_id}",
                full_name=full_name,
                role="admin" if is_super_admin else "buyer",
                is_approved=is_super_admin,
            )
            session.add(user)
            await session.flush()
        session.add(
            WebSession(
                id=str(uuid.uuid4()),
                user_id=user.id,
                token_hash=_secret_hash(token),
                csrf_hash=_secret_hash(csrf_token),
                user_agent="tests",
                ip_address="",
                created_at=now,
                expires_at=now + timedelta(hours=settings.WEB_SESSION_TTL_HOURS),
                last_seen_at=now,
                rotated_at=now,
            )
        )
        await session.commit()
    return {
        "Cookie": f"{SESSION_COOKIE_NAME}={token}",
        CSRF_HEADER_NAME: csrf_token,
    }
