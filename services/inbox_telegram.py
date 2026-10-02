"""Send new Inbox notifications to each member's connected Telegram, as Linear does to Slack.

The rules are the email ones: Settings → Notifications → Telegram decides which
kinds go out, and only notifications still unread, not deleted and not snoozed
are sent. Unlike email there is no pause: a push channel delivers right away.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Awaitable, Callable, Optional

from sqlalchemy import and_, delete, select, update
from sqlalchemy.dialects.postgresql import insert

from api.routers.audit import _stored_notification_channels
from core import telegram
from database.db import async_session_maker
from database.models import (
    AuditEvent,
    InboxTelegramDelivery,
    TelegramConnection,
    User,
    Workspace,
    WorkspaceMember,
)
from services.inbox_email import (
    channel_condition,
    due_inbox_events,
    event_target,
    event_title,
    notification_url,
)

logger = logging.getLogger(__name__)

# Older events are not sent any more: after a long worker outage the news is stale.
TELEGRAM_LOOKBACK = timedelta(minutes=30)
MAX_MESSAGES_PER_RUN = 100
# Telegram allows about one message a second to the same chat.
SEND_INTERVAL_SECONDS = 0.05
BLOCKED_ERROR = "blocked"


def message_text(workspace: Workspace, event: AuditEvent) -> str:
    """Short: what happened and to what, the details, then where."""
    lines = [f"<b>{escape(event_title(event))}</b> · {escape(event_target(event))}"]
    if event.message:
        lines.append(escape(event.message))
    lines.append(escape(" · ".join(part for part in (event.account_name, workspace.name) if part)))
    return "\n".join(lines)


async def mark_unreachable(session, chat_id: int, error: str = BLOCKED_ERROR) -> None:
    await session.execute(
        update(TelegramConnection)
        .where(TelegramConnection.chat_id == chat_id)
        .values(delivery_error=error, delivery_error_at=datetime.now(timezone.utc))
    )


async def _claim(session, user: User, event: AuditEvent, chat_id: int) -> bool:
    """Record the message before sending it; False if it was already recorded."""
    claimed = (
        await session.execute(
            insert(InboxTelegramDelivery)
            .values(
                user_id=user.id,
                audit_event_id=event.id,
                chat_id=chat_id,
                created_at=datetime.now(timezone.utc),
            )
            .on_conflict_do_nothing(constraint="uq_inbox_telegram_user_event")
            .returning(InboxTelegramDelivery.id)
        )
    ).scalar_one_or_none()
    await session.commit()
    return claimed is not None


async def deliver_inbox_telegram(
    *,
    session_maker=None,
    now: Optional[datetime] = None,
    send: Optional[Callable[..., Awaitable[telegram.SendResult]]] = None,
    pause_seconds: float = SEND_INTERVAL_SECONDS,
) -> int:
    """Send the Telegram messages that are due; returns how many went out."""
    session_maker = session_maker or async_session_maker
    send = send or telegram.send_message
    now = now or datetime.now(timezone.utc)
    sent = 0
    async with session_maker() as session:
        members = (
            await session.execute(
                select(WorkspaceMember, User, Workspace, TelegramConnection)
                .join(TelegramConnection, TelegramConnection.member_id == WorkspaceMember.id)
                .join(User, User.id == WorkspaceMember.user_id)
                .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
                .where(TelegramConnection.delivery_error.is_(None))
                .order_by(WorkspaceMember.id)
            )
        ).all()
        for member, user, workspace, connection in members:
            if sent >= MAX_MESSAGES_PER_RUN:
                break
            wanted = channel_condition(_stored_notification_channels(member).telegram, member)
            if wanted is None:
                continue
            try:
                events = await due_inbox_events(
                    session,
                    user,
                    member,
                    workspace.id,
                    wanted=wanted,
                    delivery=InboxTelegramDelivery,
                    since=now - TELEGRAM_LOOKBACK,
                    until=now,
                    limit=MAX_MESSAGES_PER_RUN - sent,
                )
            except Exception:
                logger.exception("Could not pick Telegram notifications for member %s", member.id)
                await session.rollback()
                continue
            chat_id = connection.chat_id
            for event in events:
                if not await _claim(session, user, event, chat_id):
                    continue
                try:
                    result = await send(
                        chat_id,
                        message_text(workspace, event),
                        button=("Open in Buyerly", notification_url(workspace, event)),
                    )
                except Exception:
                    logger.exception("Telegram notification for event %s failed", event.id)
                    result = telegram.SendResult(ok=False, error="exception")
                where = and_(
                    InboxTelegramDelivery.user_id == user.id,
                    InboxTelegramDelivery.audit_event_id == event.id,
                )
                if result.ok:
                    await session.execute(
                        update(InboxTelegramDelivery).where(where).values(sent_at=datetime.now(timezone.utc))
                    )
                    sent += 1
                    await session.commit()
                elif result.unreachable:
                    # Blocked the bot: show it in Settings and stop until they come back.
                    await session.execute(delete(InboxTelegramDelivery).where(where))
                    await mark_unreachable(session, chat_id)
                    await session.commit()
                    logger.info("Telegram chat %s is unreachable: %s", chat_id, result.error)
                    break
                else:
                    # Not sent: forget it, so a later run tries again while it is still
                    # recent, and stop here, as Telegram is likely down or limiting us.
                    await session.execute(delete(InboxTelegramDelivery).where(where))
                    await session.commit()
                    return sent
                if pause_seconds:
                    await asyncio.sleep(pause_seconds)
    return sent


async def run_inbox_telegram_tick() -> None:
    if not telegram.is_configured():
        return
    try:
        sent = await deliver_inbox_telegram()
    except Exception:
        logger.exception("Inbox Telegram run failed")
        return
    if sent:
        logger.info("Sent %d Inbox notification(s) to Telegram", sent)
