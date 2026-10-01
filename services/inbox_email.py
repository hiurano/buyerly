"""Email each member about Inbox notifications they have not read, as Linear does.

Linear sends an email only while the Inbox notification is still unread, so the
worker waits a little after each event and then emails whoever has not read,
deleted or snoozed it yet. Each member's Settings → Notifications → Email
decides which kinds go out.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional

from sqlalchemy import and_, delete, exists, select, update
from sqlalchemy.dialects.postgresql import insert

from api.routers.audit import (
    _inbox_columns,
    _inbox_kind,
    _inbox_priority,
    _stored_inbox_display,
    _stored_notification_channels,
)
from core.config import settings
from core.email import send_inbox_notification_email
from database.db import async_session_maker
from database.models import (
    AuditEvent,
    InboxEmailDelivery,
    InboxNotificationState,
    User,
    Workspace,
    WorkspaceMember,
)

logger = logging.getLogger(__name__)

# How long a notification has to stay unread before it is emailed.
EMAIL_DELAY = timedelta(minutes=5)
# Older events are not emailed any more: after a long worker outage the news is stale.
EMAIL_LOOKBACK = timedelta(minutes=30)
MAX_EMAILS_PER_RUN = 100
# Resend accepts two requests a second.
SEND_INTERVAL_SECONDS = 0.6

# The Inbox row titles from frontend/src/lib/audit.ts (AUDIT_EVENT_TITLES); a
# contract test keeps the two lists equal.
EVENT_TITLES = {
    "STOP": "Turned off",
    "AUTO_REACTIVATE": "Turned on",
    "MANUAL_PAUSE": "Turned off manually",
    "MANUAL_REACTIVATE": "Turned on manually",
    "INCREASE_BUDGET": "Budget raised",
    "DECREASE_BUDGET": "Budget lowered",
    "NOTIFY_ONLY": "Rule alert",
    "PROPOSE_REACTIVATE": "Suggested turning on",
    "STOP_CONFIRMATION_STARTED": "Rechecking before turning off",
    "RULE_ACTION_COOLDOWN": "Skipped during the rule's pause",
    "RULE_ACTION_PENDING": "Waiting for Meta",
    "RULE_ACTION_RECONCILED": "Confirmed with Meta",
    "UNDO_ACTION": "Undone",
    "UNDO_ACTION_FAILED": "Undo failed",
    "ACCOUNT_DAY_STARTED": "New day in the ad account",
    "ACCOUNT_HEALTH_ALERT": "Ad account needs attention",
    "ACCOUNT_HEALTH_RECOVERED": "Ad account is back to normal",
    "ACCOUNT_ISSUE": "Ad account issue",
    "TOKEN_EXPIRED": "Meta access expired",
    "DELETE_RULE_PRESET": "Rule deleted",
    "RESTORE_RULE_PRESET": "Rule restored",
    "ASSISTANT_CREATE_RULE": "AI assistant created a rule",
    "ASSISTANT_ATTACH_RULE": "AI assistant attached a rule",
    "ASSISTANT_DETACH_RULE": "AI assistant detached a rule",
}


def _humanize(value: str) -> str:
    parts = [part for part in (value or "").strip().lower().split("_") if part]
    return " ".join(part.capitalize() for part in parts) or "Unknown"


def event_title(event: AuditEvent) -> str:
    """The same title the Inbox row shows."""
    return EVENT_TITLES.get(event.event_type) or _humanize(
        event.action or event.event_type or event.category
    )


def event_target(event: AuditEvent) -> str:
    return (
        event.entity_name
        or event.adset_name
        or event.account_name
        or event.entity_id
        or event.adset_id
        or event.account_id
        or "Workspace event"
    )


def _webapp_url() -> str:
    return (settings.WEBAPP_URL or "https://buyerly.app").rstrip("/")


def notification_url(workspace: Workspace, event: AuditEvent) -> str:
    return f"{_webapp_url()}/{workspace.slug}/inbox/{event.id}"


def email_settings_url(workspace: Workspace) -> str:
    """Where Unsubscribe leads: Settings → Notifications → Email."""
    return f"{_webapp_url()}/{workspace.slug}/settings/account/notifications/email"


def _email_condition(user: User, member: WorkspaceMember):
    """Which notifications this member wants by email, or None for none at all."""
    email = _stored_notification_channels(member).email
    if not email.enabled:
        return None
    display = _stored_inbox_display(member)
    # As in Linear, "Only deliver priority notifications" counts only while the
    # priority inbox is on; then the kinds below it do not apply.
    if email.priority_only and display.priority_inbox:
        return _inbox_priority(display.priority())
    if not email.kinds:
        return None
    return _inbox_kind().in_(email.kinds)


async def _due_events(session, user, member, workspace_id, now, limit):
    wanted = _email_condition(user, member)
    if wanted is None:
        return []
    join_on, is_read, deleted, snoozed = _inbox_columns(user, member)
    already_emailed = exists().where(
        InboxEmailDelivery.user_id == user.id,
        InboxEmailDelivery.audit_event_id == AuditEvent.id,
    )
    return (
        await session.execute(
            select(AuditEvent)
            .outerjoin(InboxNotificationState, join_on)
            .where(
                AuditEvent.workspace_id == workspace_id,
                AuditEvent.created_at > now - EMAIL_DELAY - EMAIL_LOOKBACK,
                AuditEvent.created_at <= now - EMAIL_DELAY,
                ~deleted,
                ~snoozed,
                ~is_read,
                wanted,
                ~already_emailed,
            )
            .order_by(AuditEvent.created_at, AuditEvent.id)
            .limit(limit)
        )
    ).scalars().all()


async def _claim(session, user: User, event: AuditEvent) -> bool:
    """Record the email before sending it; False if it was already recorded."""
    claimed = (
        await session.execute(
            insert(InboxEmailDelivery)
            .values(
                user_id=user.id,
                audit_event_id=event.id,
                email=user.email,
                created_at=datetime.now(timezone.utc),
            )
            .on_conflict_do_nothing(constraint="uq_inbox_email_user_event")
            .returning(InboxEmailDelivery.id)
        )
    ).scalar_one_or_none()
    await session.commit()
    return claimed is not None


async def deliver_inbox_emails(
    *,
    session_maker=None,
    now: Optional[datetime] = None,
    send: Optional[Callable[..., Awaitable[bool]]] = None,
    pause_seconds: float = SEND_INTERVAL_SECONDS,
) -> int:
    """Send the emails that are due; returns how many went out.

    A failure here only costs emails: rules run in their own worker job.
    """
    session_maker = session_maker or async_session_maker
    send = send or send_inbox_notification_email
    now = now or datetime.now(timezone.utc)
    sent = 0
    async with session_maker() as session:
        members = (
            await session.execute(
                select(WorkspaceMember, User, Workspace)
                .join(User, User.id == WorkspaceMember.user_id)
                .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
                .where(User.email.is_not(None), User.email != "")
                .order_by(WorkspaceMember.id)
            )
        ).all()
        for member, user, workspace in members:
            if sent >= MAX_EMAILS_PER_RUN:
                break
            try:
                events = await _due_events(
                    session, user, member, workspace.id, now, MAX_EMAILS_PER_RUN - sent
                )
            except Exception:
                logger.exception("Could not pick Inbox emails for member %s", member.id)
                await session.rollback()
                continue
            for event in events:
                if not await _claim(session, user, event):
                    continue
                try:
                    delivered = await send(
                        to_email=user.email,
                        workspace_name=workspace.name,
                        title=event_title(event),
                        target=event_target(event),
                        account_name=event.account_name or "",
                        message=event.message or "",
                        url=notification_url(workspace, event),
                        settings_url=email_settings_url(workspace),
                    )
                except Exception:
                    logger.exception("Inbox email for event %s failed", event.id)
                    delivered = False
                where = and_(
                    InboxEmailDelivery.user_id == user.id,
                    InboxEmailDelivery.audit_event_id == event.id,
                )
                if delivered:
                    await session.execute(
                        update(InboxEmailDelivery).where(where).values(sent_at=datetime.now(timezone.utc))
                    )
                    sent += 1
                    await session.commit()
                else:
                    # Not sent: forget it, so a later run tries again while it is still
                    # recent, and stop here, as the mail service is likely down.
                    await session.execute(delete(InboxEmailDelivery).where(where))
                    await session.commit()
                    return sent
                if pause_seconds:
                    await asyncio.sleep(pause_seconds)
    return sent


async def run_inbox_email_tick() -> None:
    try:
        sent = await deliver_inbox_emails()
    except Exception:
        logger.exception("Inbox email run failed")
        return
    if sent:
        logger.info("Sent %d Inbox notification email(s)", sent)
