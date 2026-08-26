"""Encryption and resolution helpers for Meta access tokens."""

from typing import Any, Dict, Optional
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings


class MetaTokenError(RuntimeError):
    """Safe operational error for a missing or unusable Meta authorization."""


def _fernet() -> MultiFernet:
    raw_key = settings.META_TOKEN_ENCRYPTION_KEY.strip()
    if not raw_key:
        raise MetaTokenError("META_TOKEN_ENCRYPTION_KEY is not configured")
    try:
        keys = [part.strip() for part in raw_key.split(",") if part.strip()]
        if not keys:
            raise ValueError
        # New tokens use the first key; older keys remain decrypt-only. This
        # allows zero-downtime rotation by prepending a new key.
        return MultiFernet([Fernet(key.encode("ascii")) for key in keys])
    except (TypeError, ValueError) as exc:
        raise MetaTokenError("META_TOKEN_ENCRYPTION_KEY is invalid") from exc


def encrypt_meta_token(access_token: str) -> str:
    token = str(access_token or "").strip()
    if not token:
        raise MetaTokenError("Meta access token is empty")
    return _fernet().encrypt(token.encode("utf-8")).decode("ascii")


def decrypt_meta_token(encrypted_token: str) -> str:
    try:
        return _fernet().decrypt(str(encrypted_token).encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError, ValueError) as exc:
        raise MetaTokenError("Stored Meta access token cannot be decrypted") from exc


def rotate_meta_token(encrypted_token: str) -> str:
    """Re-encrypt a token ciphertext with the primary encryption key."""
    token = str(encrypted_token or "").strip()
    if not token:
        raise MetaTokenError("Encrypted Meta token is empty")
    try:
        return _fernet().rotate(token.encode("ascii")).decode("ascii")
    except (InvalidToken, UnicodeError, ValueError) as exc:
        raise MetaTokenError("Stored Meta access token cannot be rotated") from exc


async def rotate_stored_meta_tokens(session: AsyncSession) -> Dict[str, int]:
    """Re-encrypt all stored Meta tokens with the latest primary encryption key."""
    from database.models import Account, MetaConnection

    stats = {"connections_rotated": 0, "accounts_rotated": 0}

    conn_result = await session.execute(
        select(MetaConnection).where(
            MetaConnection.access_token_encrypted.isnot(None),
            MetaConnection.access_token_encrypted != "",
        )
    )
    for conn in conn_result.scalars().all():
        if conn.access_token_encrypted:
            rotated = rotate_meta_token(conn.access_token_encrypted)
            if rotated != conn.access_token_encrypted:
                conn.access_token_encrypted = rotated
                stats["connections_rotated"] += 1

    acc_result = await session.execute(
        select(Account).where(
            Account.access_token_encrypted.isnot(None),
            Account.access_token_encrypted != "",
        )
    )
    for acc in acc_result.scalars().all():
        if acc.access_token_encrypted:
            rotated = rotate_meta_token(acc.access_token_encrypted)
            if rotated != acc.access_token_encrypted:
                acc.access_token_encrypted = rotated
                stats["accounts_rotated"] += 1

    await session.commit()
    return stats


async def resolve_account_access_token(
    session: AsyncSession,
    account,
    connection_cache: Optional[Dict[int, Any]] = None,
) -> str:
    """Resolve Meta tokens by OAuth connection or encrypted manual token."""

    if account.meta_connection_id:
        connection = None
        if connection_cache is not None:
            connection = connection_cache.get(account.meta_connection_id)
        if connection is None:
            from database.models import MetaConnection

            result = await session.execute(
                select(MetaConnection).where(MetaConnection.id == account.meta_connection_id)
            )
            connection = result.scalar_one_or_none()
            if connection_cache is not None and connection is not None:
                connection_cache[account.meta_connection_id] = connection
        if not connection:
            raise MetaTokenError("Meta connection was not found")
        if connection.status != "active":
            raise MetaTokenError("Meta connection requires reconnection")
        if (
            account.owner_user_id is not None
            and connection.owner_user_id != account.owner_user_id
        ):
            raise MetaTokenError("Meta connection ownership mismatch")
        return decrypt_meta_token(connection.access_token_encrypted)

    encrypted_token = str(getattr(account, "access_token_encrypted", "") or "").strip()
    if encrypted_token:
        return decrypt_meta_token(encrypted_token)

    legacy_token = str(getattr(account, "access_token", "") or "").strip()
    if legacy_token:
        if legacy_token.startswith("gAAAAA"):
            try:
                return decrypt_meta_token(legacy_token)
            except Exception:
                pass
        return legacy_token

    raise MetaTokenError("Meta authorization is missing")
