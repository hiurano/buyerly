"""Each member's list views, remembered on the server as Linear does (#385).

A list page — Inbox, Rules, each Ads Manager level, Ad accounts — saves its
layout, grouping, ordering, direction, display properties and filters under
its own key, for the signed-in member of the active workspace, on every
device. The server does not know a page's shape: it stores a small JSON
object per key and hands it back. Deleting a key returns the page to its
defaults (Linear's "Reset").
"""

import json
import re
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, select

from api.auth import get_current_user
from api.deps import get_user_workspace_member
from database.db import async_session_maker
from database.models import User, ViewSetting, utcnow

router = APIRouter(tags=["Views"])

# "rules", "inbox", "ads-manager.campaigns", "ad-accounts"…
VIEW_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9-]{0,31}(\.[a-z0-9-]{1,31})?$")
MAX_VIEW_BYTES = 16_384
MAX_VIEWS_PER_MEMBER = 100


class ViewSettingsPayload(BaseModel):
    settings: Dict[str, Any]

    @field_validator("settings")
    @classmethod
    def _small(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        if len(json.dumps(value, separators=(",", ":"))) > MAX_VIEW_BYTES:
            raise ValueError(f"View settings must be under {MAX_VIEW_BYTES // 1024} KB")
        return value


def _view_key(view_key: str) -> str:
    if not VIEW_KEY_PATTERN.match(view_key):
        raise HTTPException(status_code=404, detail="Unknown view.")
    return view_key


async def _member(session, user: User):
    ws, member = await get_user_workspace_member(session, user)
    if not ws or not member:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return member


def _writable(member):
    # Support access without a membership row sees the defaults and keeps nothing.
    if member.id is None:
        raise HTTPException(status_code=403, detail="Support access cannot change views.")
    return member


@router.get("/view-settings")
async def list_view_settings(user: User = Depends(get_current_user)):
    """Every view this member changed in the active workspace; a missing key means defaults."""
    async with async_session_maker() as session:
        member = await _member(session, user)
        if member.id is None:
            return {"views": {}}
        rows = (
            await session.execute(
                select(ViewSetting.view_key, ViewSetting.settings).where(
                    ViewSetting.member_id == member.id
                )
            )
        ).all()
    return {"views": {key: settings for key, settings in rows if isinstance(settings, dict)}}


@router.put("/view-settings/{view_key}")
async def save_view_settings(
    view_key: str, payload: ViewSettingsPayload, user: User = Depends(get_current_user)
):
    key = _view_key(view_key)
    async with async_session_maker() as session:
        member = _writable(await _member(session, user))
        stored = (
            await session.execute(
                select(ViewSetting).where(
                    ViewSetting.member_id == member.id, ViewSetting.view_key == key
                )
            )
        ).scalar_one_or_none()
        if stored is None:
            count = len(
                (
                    await session.execute(
                        select(ViewSetting.id).where(ViewSetting.member_id == member.id)
                    )
                ).all()
            )
            if count >= MAX_VIEWS_PER_MEMBER:
                raise HTTPException(status_code=400, detail="Too many saved views.")
            stored = ViewSetting(member_id=member.id, view_key=key)
            session.add(stored)
        stored.settings = payload.settings
        stored.updated_at = utcnow()
        await session.commit()
    return {"view_key": key, "settings": payload.settings}


@router.delete("/view-settings/{view_key}", status_code=204)
async def reset_view_settings(view_key: str, user: User = Depends(get_current_user)):
    key = _view_key(view_key)
    async with async_session_maker() as session:
        member = _writable(await _member(session, user))
        await session.execute(
            delete(ViewSetting).where(
                ViewSetting.member_id == member.id, ViewSetting.view_key == key
            )
        )
        await session.commit()
    return Response(status_code=204)
