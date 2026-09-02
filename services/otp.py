import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from database.models import EmailVerificationCode


OTP_LOGIN = "login"
OTP_EMAIL_CHANGE = "email_change"
OTP_EMAIL_VERIFICATION = "email_verification"


@dataclass(frozen=True)
class IssuedOtp:
    record_id: int
    code: str
    link_token: str


@dataclass(frozen=True)
class ConsumedOtp:
    status: str
    email: str | None = None
    purpose: str | None = None
    invite_id: int | None = None


def login_scope(email: str) -> str:
    return f"login:{email.strip().lower()}"


def email_scope(user_id: int) -> str:
    return f"email:{user_id}"


def _hash_code(code: str) -> str:
    pepper = settings.OTP_PEPPER or settings.BOT_TOKEN
    if not pepper:
        raise RuntimeError("OTP_PEPPER or BOT_TOKEN must be configured")
    return hmac.new(
        pepper.encode("utf-8"),
        code.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


async def has_recent_active_otp(
    session: AsyncSession,
    *,
    scope: str,
    seconds: int = 60,
) -> bool:
    bind = session.get_bind()
    if bind.dialect.name == "postgresql":
        await session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
            {"lock_key": f"buyerly-otp-scope:{scope}"},
        )
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=seconds)
    record_id = (
        await session.execute(
            select(EmailVerificationCode.id)
            .where(
                EmailVerificationCode.scope == scope,
                EmailVerificationCode.is_used.is_(False),
                EmailVerificationCode.created_at > cutoff,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return record_id is not None


async def create_otp(
    session: AsyncSession,
    *,
    email: str,
    purpose: str,
    scope: str,
    invite_id: int | None = None,
) -> IssuedOtp:
    now = datetime.now(timezone.utc)
    await session.execute(
        update(EmailVerificationCode)
        .where(
            EmailVerificationCode.scope == scope,
            EmailVerificationCode.is_used.is_(False),
        )
        .values(is_used=True)
    )

    code = str(secrets.randbelow(900000) + 100000)
    link_token = secrets.token_urlsafe(32)
    record = EmailVerificationCode(
        email=email.strip().lower(),
        code="",
        code_hash=_hash_code(code),
        link_token_hash=_hash_code(link_token),
        invite_id=invite_id,
        purpose=purpose,
        scope=scope,
        expires_at=now + timedelta(minutes=15),
        is_used=False,
        failed_attempts=0,
        delivered_at=None,
        created_at=now,
    )
    session.add(record)
    await session.flush()
    return IssuedOtp(record_id=record.id, code=code, link_token=link_token)


async def mark_otp_delivered(session: AsyncSession, record_id: int) -> bool:
    record = (
        await session.execute(
            update(EmailVerificationCode)
            .where(
                EmailVerificationCode.id == record_id,
                EmailVerificationCode.is_used.is_(False),
                EmailVerificationCode.delivered_at.is_(None),
            )
            .values(delivered_at=datetime.now(timezone.utc))
            .returning(EmailVerificationCode.id)
        )
    ).scalar_one_or_none()
    return record is not None


async def invalidate_otp(session: AsyncSession, record_id: int) -> None:
    await session.execute(
        update(EmailVerificationCode)
        .where(EmailVerificationCode.id == record_id)
        .values(is_used=True)
    )


async def consume_otp(
    session: AsyncSession,
    *,
    scope: str,
    entered_code: str,
) -> ConsumedOtp:
    """Atomically consume one delivered OTP or count one failed attempt."""
    now = datetime.now(timezone.utc)
    record_id = (
        await session.execute(
            select(EmailVerificationCode.id)
            .where(
                EmailVerificationCode.scope == scope,
                EmailVerificationCode.is_used.is_(False),
                EmailVerificationCode.delivered_at.is_not(None),
                EmailVerificationCode.expires_at > now,
                EmailVerificationCode.failed_attempts < 5,
            )
            .order_by(EmailVerificationCode.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if record_id is None:
        return ConsumedOtp(status="invalid")

    expected_hash = _hash_code(entered_code.strip())
    consumed = (
        await session.execute(
            update(EmailVerificationCode)
            .where(
                EmailVerificationCode.id == record_id,
                EmailVerificationCode.is_used.is_(False),
                EmailVerificationCode.delivered_at.is_not(None),
                EmailVerificationCode.expires_at > now,
                EmailVerificationCode.failed_attempts < 5,
                EmailVerificationCode.code_hash == expected_hash,
            )
            .values(is_used=True)
            .returning(
                EmailVerificationCode.email,
                EmailVerificationCode.purpose,
                EmailVerificationCode.invite_id,
            )
        )
    ).one_or_none()
    if consumed is not None:
        return ConsumedOtp(
            status="consumed",
            email=consumed.email,
            purpose=consumed.purpose,
            invite_id=consumed.invite_id,
        )

    new_attempts = EmailVerificationCode.failed_attempts + 1
    failed = (
        await session.execute(
            update(EmailVerificationCode)
            .where(
                EmailVerificationCode.id == record_id,
                EmailVerificationCode.is_used.is_(False),
                EmailVerificationCode.delivered_at.is_not(None),
                EmailVerificationCode.expires_at > now,
                EmailVerificationCode.failed_attempts < 5,
            )
            .values(
                failed_attempts=new_attempts,
                is_used=case((new_attempts >= 5, True), else_=False),
            )
            .returning(
                EmailVerificationCode.failed_attempts,
                EmailVerificationCode.is_used,
            )
        )
    ).one_or_none()
    if failed is None:
        return ConsumedOtp(status="invalid")
    return ConsumedOtp(status="locked" if failed.is_used else "invalid")


async def consume_magic_link(
    session: AsyncSession,
    *,
    raw_token: str,
) -> ConsumedOtp:
    """Atomically consume a delivered, unexpired email-link token."""
    token = raw_token.strip()
    if not token:
        return ConsumedOtp(status="invalid")

    now = datetime.now(timezone.utc)
    consumed = (
        await session.execute(
            update(EmailVerificationCode)
            .where(
                EmailVerificationCode.link_token_hash == _hash_code(token),
                EmailVerificationCode.is_used.is_(False),
                EmailVerificationCode.delivered_at.is_not(None),
                EmailVerificationCode.expires_at > now,
            )
            .values(is_used=True)
            .returning(
                EmailVerificationCode.email,
                EmailVerificationCode.purpose,
                EmailVerificationCode.invite_id,
            )
        )
    ).one_or_none()
    if consumed is None:
        return ConsumedOtp(status="invalid")
    return ConsumedOtp(
        status="consumed",
        email=consumed.email,
        purpose=consumed.purpose,
        invite_id=consumed.invite_id,
    )
