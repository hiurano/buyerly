"""Settings → Notifications → Desktop: this browser's Web Push subscription, as Linear's Desktop channel.

Turning the channel on asks the browser for permission, subscribes it with the server's
VAPID key and sends the subscription here; it belongs to the member and to the sign-in it
was made in, so logging out of the browser ends it. Turning it off forgets this browser
only; the channel's other settings are the member's, on every device.
"""

import ipaddress
from typing import Any, Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from api.auth import get_current_user
from api.routers.audit import INBOX_KINDS, _inbox_member, _stored_notification_channels
from core import web_push
from database.db import async_session_maker
from database.models import DesktopPushSubscription, User, WorkspaceMember

router = APIRouter(tags=["notifications"])

MAX_ENDPOINT_LENGTH = 2048


def _valid_endpoint(value: str) -> str:
    value = value.strip()
    parts = urlsplit(value)
    host = parts.hostname or ""
    if parts.scheme != "https" or not host or len(value) > MAX_ENDPOINT_LENGTH:
        raise ValueError("Not a push service address")
    # A push service is a public host, never this server's network.
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            raise ValueError("Not a push service address")
    else:
        raise ValueError("Not a push service address")
    return value


class PushKeys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)

    @field_validator("p256dh")
    @classmethod
    def _p256_point(cls, value: str) -> str:
        try:
            raw = web_push.b64url_decode(value)
        except ValueError as error:
            raise ValueError("Not a P-256 public key") from error
        if len(raw) != 65 or raw[0] != 4:
            raise ValueError("Not a P-256 public key")
        return value

    @field_validator("auth")
    @classmethod
    def _auth_secret(cls, value: str) -> str:
        try:
            raw = web_push.b64url_decode(value)
        except ValueError as error:
            raise ValueError("Not an auth secret") from error
        if len(raw) != 16:
            raise ValueError("Not an auth secret")
        return value


class PushSubscriptionIn(BaseModel):
    """PushSubscription.toJSON() from the browser."""

    endpoint: str
    keys: PushKeys

    @field_validator("endpoint")
    @classmethod
    def _push_service(cls, value: str) -> str:
        return _valid_endpoint(value)


class PushEndpoint(BaseModel):
    endpoint: str = Field(max_length=MAX_ENDPOINT_LENGTH)


async def _subscription(session, member, endpoint: Optional[str]) -> Optional[DesktopPushSubscription]:
    if member.id is None or not endpoint:
        return None
    return (
        await session.execute(
            select(DesktopPushSubscription).where(
                DesktopPushSubscription.member_id == member.id,
                DesktopPushSubscription.endpoint == endpoint,
            )
        )
    ).scalar_one_or_none()


def _payload(subscription: Optional[DesktopPushSubscription], request: Request, **extra) -> dict[str, Any]:
    # A subscription made in another sign-in of this browser (since logged out) does not count.
    session_id = getattr(request.state, "web_session_id", None)
    return {
        "available": web_push.is_configured(),
        "public_key": web_push.public_key(),
        "subscribed": subscription is not None and subscription.web_session_id == session_id,
        **extra,
    }


async def _own_member(session, user: User):
    _, member = await _inbox_member(session, user)
    if member.id is None:
        raise HTTPException(status_code=403, detail="Support access cannot change these settings.")
    return member


@router.get("/notifications/desktop")
async def get_desktop_notifications(
    request: Request,
    endpoint: Optional[str] = Query(default=None, max_length=MAX_ENDPOINT_LENGTH),
    user: User = Depends(get_current_user),
):
    """Whether desktop notifications can work here, and whether this browser gets them."""
    async with async_session_maker() as session:
        _, member = await _inbox_member(session, user)
        return _payload(await _subscription(session, member, endpoint), request)


@router.post("/notifications/desktop/subscribe")
async def subscribe_desktop_notifications(
    request: Request,
    payload: PushSubscriptionIn,
    user: User = Depends(get_current_user),
):
    """This browser now gets the member's desktop notifications; the channel is on."""
    if not web_push.is_configured():
        raise HTTPException(status_code=409, detail="Desktop notifications are not available.")
    session_id = getattr(request.state, "web_session_id", None)
    if not session_id:
        raise HTTPException(status_code=400, detail="Desktop notifications need a browser sign-in.")
    async with async_session_maker() as session:
        member = await _own_member(session, user)
        values = {
            "web_session_id": session_id,
            "p256dh": payload.keys.p256dh,
            "auth": payload.keys.auth,
            "user_agent": (request.headers.get("user-agent") or "")[:500],
        }
        await session.execute(
            insert(DesktopPushSubscription)
            .values(member_id=member.id, endpoint=payload.endpoint, **values)
            .on_conflict_do_update(constraint="uq_desktop_push_member_endpoint", set_=values)
        )
        stored = await session.get(WorkspaceMember, member.id)
        channels = _stored_notification_channels(stored)
        channels.desktop.enabled = True
        # As in Linear: switching a channel on with every type off switches every type on.
        if not channels.desktop.kinds and not channels.desktop.priority_only:
            channels.desktop.kinds = list(INBOX_KINDS)
        stored.notification_channels = channels.model_dump()
        await session.commit()
        return _payload(await _subscription(session, member, payload.endpoint), request)


@router.post("/notifications/desktop/unsubscribe")
async def unsubscribe_desktop_notifications(
    request: Request,
    payload: PushEndpoint,
    user: User = Depends(get_current_user),
):
    """This browser stops getting them; with no browser left the channel is off.

    `browser_in_use` tells the page whether another account here still uses the browser's
    push subscription, so it ends that subscription only when nobody does.
    """
    async with async_session_maker() as session:
        member = await _own_member(session, user)
        await session.execute(
            delete(DesktopPushSubscription).where(
                DesktopPushSubscription.member_id == member.id,
                DesktopPushSubscription.endpoint == payload.endpoint,
            )
        )
        remaining = (
            await session.execute(
                select(func.count())
                .select_from(DesktopPushSubscription)
                .where(DesktopPushSubscription.member_id == member.id)
            )
        ).scalar_one()
        if not remaining:
            stored = await session.get(WorkspaceMember, member.id)
            channels = _stored_notification_channels(stored)
            if channels.desktop.enabled:
                channels.desktop.enabled = False
                stored.notification_channels = channels.model_dump()
        in_use = (
            await session.execute(
                select(func.count())
                .select_from(DesktopPushSubscription)
                .where(DesktopPushSubscription.endpoint == payload.endpoint)
            )
        ).scalar_one()
        await session.commit()
        return _payload(None, request, browser_in_use=bool(in_use))
