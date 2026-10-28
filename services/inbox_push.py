"""Send new Inbox notifications to each member's browsers as desktop notifications, as Linear does.

The rules are the other channels': Settings → Notifications → Desktop decides which kinds go
out, and only notifications still unread, not deleted and not snoozed are sent, right away.
Each notification goes once to every browser the member turned the channel on in, while that
browser is still signed in; the push service's 404 or 410 means the browser dropped the
subscription, which is then forgotten.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert

from api.routers.audit import _stored_notification_channels
from core import web_push
from database.db import async_session_maker
from database.models import (
    AuditEvent,
    DesktopPushSubscription,
    InboxPushDelivery,
    User,
    WebSession,
    Workspace,
    WorkspaceMember,
)
from services.inbox_email import channel_condition, due_inbox_events, event_target, event_title

logger = logging.getLogger(__name__)

# Older events are not sent any more: after a long worker outage the news is stale.
PUSH_LOOKBACK = timedelta(minutes=30)
MAX_NOTIFICATIONS_PER_RUN = 100


def notification_path(workspace: Workspace, event: AuditEvent) -> str:
    """The Inbox record, on this origin: the service worker opens it on click."""
    return f"/{workspace.slug}/inbox/{event.id}"


def push_message(workspace: Workspace, event: AuditEvent) -> dict:
    """What the service worker shows: title, the details, where; and what a click opens."""
    details = [event.message] if event.message else []
    details.append(" · ".join(part for part in (event.account_name, workspace.name) if part))
    return {
        "title": f"{event_title(event)} · {event_target(event)}",
        "body": "\n".join(line for line in details if line)[:500],
        "url": notification_path(workspace, event),
        # One notification per record: a repeat replaces it instead of piling up.
        "tag": f"inbox-{event.id}",
        "id": event.id,
    }


async def _forget_signed_out(session, now: datetime) -> None:
    """Subscriptions whose sign-in ended (logged out, revoked or expired) never deliver again."""
    ended = select(WebSession.id).where(or_(WebSession.revoked_at.is_not(None), WebSession.expires_at <= now))
    await session.execute(delete(DesktopPushSubscription).where(DesktopPushSubscription.web_session_id.in_(ended)))
    await session.commit()


async def _claim(session, user: User, event: AuditEvent) -> bool:
    """Record the notification before sending it; False if it was already recorded."""
    claimed = (
        await session.execute(
            insert(InboxPushDelivery)
            .values(user_id=user.id, audit_event_id=event.id, created_at=datetime.now(timezone.utc))
            .on_conflict_do_nothing(constraint="uq_inbox_push_user_event")
            .returning(InboxPushDelivery.id)
        )
    ).scalar_one_or_none()
    await session.commit()
    return claimed is not None


async def deliver_inbox_push(
    *,
    session_maker=None,
    now: Optional[datetime] = None,
    send: Optional[Callable[..., Awaitable[web_push.SendResult]]] = None,
) -> int:
    """Send the desktop notifications that are due; returns how many Inbox notifications went out."""
    session_maker = session_maker or async_session_maker
    send = send or web_push.send
    now = now or datetime.now(timezone.utc)
    sent = 0
    async with session_maker() as session:
        await _forget_signed_out(session, now)
        subscriptions: dict[int, list[DesktopPushSubscription]] = {}
        for subscription in (
            await session.execute(select(DesktopPushSubscription).order_by(DesktopPushSubscription.id))
        ).scalars():
            subscriptions.setdefault(subscription.member_id, []).append(subscription)
        if not subscriptions:
            return 0
        members = (
            await session.execute(
                select(WorkspaceMember, User, Workspace)
                .join(User, User.id == WorkspaceMember.user_id)
                .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
                .where(WorkspaceMember.id.in_(subscriptions))
                .order_by(WorkspaceMember.id)
            )
        ).all()
        for member, user, workspace in members:
            if sent >= MAX_NOTIFICATIONS_PER_RUN:
                break
            wanted = channel_condition(_stored_notification_channels(member).desktop, member)
            if wanted is None:
                continue
            try:
                events = await due_inbox_events(
                    session,
                    user,
                    member,
                    workspace.id,
                    wanted=wanted,
                    delivery=InboxPushDelivery,
                    since=now - PUSH_LOOKBACK,
                    until=now,
                    limit=MAX_NOTIFICATIONS_PER_RUN - sent,
                )
            except Exception:
                logger.exception("Could not pick desktop notifications for member %s", member.id)
                await session.rollback()
                continue
            browsers = subscriptions[member.id]
            for event in events:
                if not browsers or not await _claim(session, user, event):
                    continue
                message = push_message(workspace, event)
                delivered = failed = False
                for browser in list(browsers):
                    try:
                        result = await send(browser.endpoint, browser.p256dh, browser.auth, message)
                    except Exception:
                        logger.exception("Desktop notification for event %s failed", event.id)
                        result = web_push.SendResult(ok=False, error="exception")
                    if result.ok:
                        delivered = True
                    elif result.gone:
                        # The browser unsubscribed or the subscription expired.
                        await session.execute(
                            delete(DesktopPushSubscription).where(DesktopPushSubscription.id == browser.id)
                        )
                        browsers.remove(browser)
                    else:
                        failed = True
                        logger.info(
                            "Push service refused event %s: %s %s", event.id, result.status, result.error
                        )
                where = and_(
                    InboxPushDelivery.user_id == user.id,
                    InboxPushDelivery.audit_event_id == event.id,
                )
                if delivered:
                    await session.execute(
                        update(InboxPushDelivery).where(where).values(sent_at=datetime.now(timezone.utc))
                    )
                    sent += 1
                elif failed:
                    # Reached no browser: forget it, so a later run tries again while it is recent.
                    await session.execute(delete(InboxPushDelivery).where(where))
                await session.commit()
                if failed and not delivered:
                    break
    return sent


async def run_inbox_push_tick() -> None:
    if not web_push.is_configured():
        return
    try:
        sent = await deliver_inbox_push()
    except Exception:
        logger.exception("Inbox desktop notifications run failed")
        return
    if sent:
        logger.info("Sent %d Inbox notification(s) to desktops", sent)
