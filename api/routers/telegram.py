"""Settings → Connected accounts → Telegram, and the webhook the bot is called through.

As Linear's personal Slack account: Connect opens the bot by a one-time link, the
person presses Start, and the account belongs to that member of that workspace.
The bot answers only those links and ignores everything else.
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert

from api.auth import get_current_user
from api.routers.audit import INBOX_KINDS, _inbox_member, _stored_notification_channels
from core import telegram
from core.rate_limit import rate_limit_dep
from database.db import async_session_maker
from database.models import TelegramConnection, TelegramLinkToken, User, Workspace, WorkspaceMember

logger = logging.getLogger(__name__)

router = APIRouter(tags=["telegram"])

# The link works once and only for a short while.
LINK_TTL = timedelta(minutes=10)

LINKED_TEXT = (
    "Telegram is connected to <b>{workspace}</b> in Buyerly. "
    "New notifications from your Inbox will arrive here."
)
EXPIRED_TEXT = (
    "This link has expired or was already used. In Buyerly open Settings → "
    "Connected accounts and press Connect again."
)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _connection_payload(connection: Optional[TelegramConnection]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "available": telegram.is_configured(),
        "connected": connection is not None,
        "username": None,
        "first_name": None,
        "connected_at": None,
        "error": None,
    }
    if connection is not None:
        payload.update(
            username=connection.username,
            first_name=connection.first_name,
            connected_at=connection.connected_at.isoformat() if connection.connected_at else None,
            error=connection.delivery_error,
        )
    return payload


async def _member_connection(session, member) -> Optional[TelegramConnection]:
    if member.id is None:
        return None
    return (
        await session.execute(select(TelegramConnection).where(TelegramConnection.member_id == member.id))
    ).scalar_one_or_none()


async def _own_member(session, user: User):
    _, member = await _inbox_member(session, user)
    if member.id is None:
        raise HTTPException(status_code=403, detail="Support access cannot change connected accounts.")
    return member


@router.get("/telegram/connection")
async def get_telegram_connection(user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        _, member = await _inbox_member(session, user)
        return _connection_payload(await _member_connection(session, member))


@router.post(
    "/telegram/link",
    dependencies=[Depends(rate_limit_dep(limit=10, window_seconds=60, scope="telegram_link"))],
)
async def create_telegram_link(user: User = Depends(get_current_user)):
    """A fresh one-time t.me link; an older unused one stops working."""
    if not telegram.is_configured():
        raise HTTPException(status_code=503, detail="Telegram is not set up on this server yet.")
    username = await telegram.get_bot_username()
    if not username:
        raise HTTPException(status_code=503, detail="Telegram is not reachable right now. Try again later.")
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    async with async_session_maker() as session:
        member = await _own_member(session, user)
        await session.execute(delete(TelegramLinkToken).where(TelegramLinkToken.member_id == member.id))
        session.add(
            TelegramLinkToken(
                member_id=member.id,
                token_hash=_token_hash(token),
                created_at=now,
                expires_at=now + LINK_TTL,
            )
        )
        await session.commit()
    return {"url": f"https://t.me/{username}?start={token}", "expires_at": (now + LINK_TTL).isoformat()}


@router.delete("/telegram/connection")
async def disconnect_telegram(user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        member = await _own_member(session, user)
        await session.execute(delete(TelegramConnection).where(TelegramConnection.member_id == member.id))
        await session.execute(delete(TelegramLinkToken).where(TelegramLinkToken.member_id == member.id))
        await session.commit()
    return _connection_payload(None)


async def _link(token: str, chat: dict[str, Any], sender: dict[str, Any]) -> Optional[str]:
    """Connect the chat to the member the token was made for; the workspace name, or None."""
    now = datetime.now(timezone.utc)
    async with async_session_maker() as session:
        # Taking the token deletes it, so it never works twice.
        member_id = (
            await session.execute(
                delete(TelegramLinkToken)
                .where(TelegramLinkToken.token_hash == _token_hash(token))
                .returning(TelegramLinkToken.member_id, TelegramLinkToken.expires_at)
            )
        ).first()
        if member_id is None or member_id.expires_at <= now:
            await session.commit()
            return None
        member = await session.get(WorkspaceMember, member_id.member_id)
        if member is None:
            await session.commit()
            return None
        values = {
            "chat_id": int(chat["id"]),
            "username": sender.get("username"),
            "first_name": sender.get("first_name"),
            "connected_at": now,
            "delivery_error": None,
            "delivery_error_at": None,
        }
        await session.execute(
            insert(TelegramConnection)
            .values(member_id=member.id, **values)
            .on_conflict_do_update(index_elements=[TelegramConnection.member_id], set_=values)
        )
        # Connecting turns the channel on, with every type if none was left.
        channels = _stored_notification_channels(member)
        channels.telegram.enabled = True
        if not channels.telegram.kinds:
            channels.telegram.kinds = list(INBOX_KINDS)
        member.notification_channels = channels.model_dump()
        workspace = await session.get(Workspace, member.workspace_id)
        await session.commit()
        return workspace.name if workspace else "your workspace"


async def _set_reachable(chat_id: int, reachable: bool) -> None:
    async with async_session_maker() as session:
        values = (
            {"delivery_error": None, "delivery_error_at": None}
            if reachable
            else {"delivery_error": "blocked", "delivery_error_at": datetime.now(timezone.utc)}
        )
        await session.execute(
            update(TelegramConnection).where(TelegramConnection.chat_id == chat_id).values(**values)
        )
        await session.commit()


@router.post("/telegram/webhook", include_in_schema=False)
async def telegram_webhook(
    request: Request,
    secret: Optional[str] = Header(default=None, alias="X-Telegram-Bot-Api-Secret-Token"),
):
    if not telegram.is_configured() or not secret or not hmac.compare_digest(secret, telegram.webhook_secret()):
        raise HTTPException(status_code=404, detail="Not Found")
    try:
        update_body = await request.json()
    except ValueError:
        return {"ok": True}
    if not isinstance(update_body, dict):
        return {"ok": True}

    # Blocking and unblocking the bot: delivery stops and resumes with it.
    membership = update_body.get("my_chat_member")
    if isinstance(membership, dict):
        chat = membership.get("chat") or {}
        status = (membership.get("new_chat_member") or {}).get("status")
        if chat.get("type") == "private" and isinstance(chat.get("id"), int) and status in ("kicked", "member"):
            await _set_reachable(chat["id"], status == "member")
        return {"ok": True}

    message = update_body.get("message")
    if not isinstance(message, dict):
        return {"ok": True}
    chat = message.get("chat") or {}
    text = message.get("text") or ""
    # Only "/start <token>" from a private chat is a link; everything else is ignored.
    if chat.get("type") != "private" or not isinstance(chat.get("id"), int) or not text.startswith("/start "):
        return {"ok": True}
    token = text.split(maxsplit=1)[1].strip()
    if not token or len(token) > 64:
        return {"ok": True}
    workspace = await _link(token, chat, message.get("from") or {})
    reply = LINKED_TEXT.format(workspace=escape(workspace)) if workspace else EXPIRED_TEXT
    result = await telegram.send_message(int(chat["id"]), reply)
    if not result.ok:
        logger.warning("Telegram link reply to %s failed: %s", chat.get("id"), result.error)
    return {"ok": True}
