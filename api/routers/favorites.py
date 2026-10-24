"""Each member's favorites, Linear's star and the sidebar's Favorites section.

A member stars a page (a team's Campaigns, Ad accounts or Rules, My
campaigns) or a record (an ad account, a campaign, an ad set, an ad, a rule)
and it is listed in the sidebar, for that member in the active workspace, on
every device. A favorite is the app address inside the workspace plus the
name it had when starred; the server does not resolve either, so a page the
member can no longer open says so itself when followed.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select

from api.auth import get_current_user
from api.deps import get_user_workspace_member
from database.db import async_session_maker
from database.models import Favorite, User, utcnow

router = APIRouter(tags=["Favorites"])

FAVORITE_KINDS = {"page", "account", "campaign", "adset", "ad", "rule"}
# "team/TES/ads-manager/campaigns", "accounts/act_1001": no leading slash, no "..".
FAVORITE_PATH_PATTERN = re.compile(r"^[A-Za-z0-9_%~.-]+(/[A-Za-z0-9_%~.-]+)*$")
MAX_FAVORITES_PER_MEMBER = 100


class FavoritePayload(BaseModel):
    kind: str
    path: str
    title: str

    @field_validator("kind")
    @classmethod
    def _kind(cls, value: str) -> str:
        if value not in FAVORITE_KINDS:
            raise ValueError("Unknown kind of favorite.")
        return value

    @field_validator("path")
    @classmethod
    def _path(cls, value: str) -> str:
        if len(value) > 300 or not FAVORITE_PATH_PATTERN.match(value) or ".." in value.split("/"):
            raise ValueError("Not an address in the workspace.")
        return value

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 200:
            raise ValueError("A favorite needs a name of at most 200 characters.")
        return value


def _favorite(row: Favorite) -> dict:
    return {"id": row.id, "kind": row.kind, "path": row.path, "title": row.title, "position": row.position}


async def _member(session, user: User):
    ws, member = await get_user_workspace_member(session, user)
    if not ws or not member:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return member


def _writable(member):
    # Support access without a membership row sees no favorites and keeps none.
    if member.id is None:
        raise HTTPException(status_code=403, detail="Support access cannot keep favorites.")
    return member


@router.get("/favorites")
async def list_favorites(user: User = Depends(get_current_user)):
    """This member's favorites in the active workspace, in sidebar order."""
    async with async_session_maker() as session:
        member = await _member(session, user)
        if member.id is None:
            return {"favorites": []}
        rows = (
            await session.execute(
                select(Favorite)
                .where(Favorite.member_id == member.id)
                .order_by(Favorite.position, Favorite.id)
            )
        ).scalars().all()
    return {"favorites": [_favorite(row) for row in rows]}


@router.post("/favorites")
async def add_favorite(payload: FavoritePayload, response: Response, user: User = Depends(get_current_user)):
    """Stars a page or record; starring it again returns the favorite it already is."""
    async with async_session_maker() as session:
        member = _writable(await _member(session, user))
        existing = (
            await session.execute(
                select(Favorite).where(Favorite.member_id == member.id, Favorite.path == payload.path)
            )
        ).scalar_one_or_none()
        if existing is not None:
            return _favorite(existing)
        count, last = (
            await session.execute(
                select(func.count(Favorite.id), func.max(Favorite.position)).where(
                    Favorite.member_id == member.id
                )
            )
        ).one()
        if count >= MAX_FAVORITES_PER_MEMBER:
            raise HTTPException(status_code=400, detail="Too many favorites.")
        row = Favorite(
            member_id=member.id,
            kind=payload.kind,
            path=payload.path,
            title=payload.title,
            # New favorites go to the end of the section, as Linear's.
            position=(last or 0) + 1,
            created_at=utcnow(),
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
    response.status_code = 201
    return _favorite(row)


@router.delete("/favorites/{favorite_id}", status_code=204)
async def remove_favorite(favorite_id: int, user: User = Depends(get_current_user)):
    """Unstars one of this member's favorites; `204` even when it was already gone."""
    async with async_session_maker() as session:
        member = _writable(await _member(session, user))
        row = (
            await session.execute(
                select(Favorite).where(Favorite.id == favorite_id, Favorite.member_id == member.id)
            )
        ).scalar_one_or_none()
        if row is not None:
            await session.delete(row)
            await session.commit()
    return Response(status_code=204)
