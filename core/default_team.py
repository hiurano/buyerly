"""The team every workspace starts with, as Linear's.

Linear creates a team named after the workspace when the workspace is
created; its sidebar's "Your teams" is never empty. Buyerly does the same:
the workspace's first team (the oldest one neither retired nor deleted) is
its default team, and the people and ad accounts that join the workspace
join that team too.
"""

import re
from typing import Optional

from sqlalchemy import func, select

from database.models import Team, TeamAccount, TeamMember

TEAM_NAME_MAX = 48
FALLBACK_KEY = "TEAM"


def default_team_key(name: str) -> str:
    """Linear's identifier from a name: its first three letters or digits, upper-cased ("Media buying" → "MED")."""
    letters = re.sub(r"[^A-Za-z0-9]", "", name).upper().lstrip("0123456789")
    return letters[:3] or FALLBACK_KEY


async def create_default_team(session, workspace_id: int, name: str, creator_user_id: Optional[int]) -> Team:
    """The workspace's first team, named after it; the caller adds its members."""
    team = Team(
        workspace_id=workspace_id,
        name=" ".join(name.split())[:TEAM_NAME_MAX] or "Team",
        key=default_team_key(name),
        description="",
        created_by_user_id=creator_user_id,
    )
    session.add(team)
    await session.flush()
    return team


async def default_team(session, workspace_id: int) -> Optional[Team]:
    return (
        await session.execute(
            select(Team)
            .where(Team.workspace_id == workspace_id, Team.deleted_at.is_(None), Team.retired_at.is_(None))
            .order_by(Team.created_at.asc(), Team.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def join_default_team(
    session,
    workspace_id: Optional[int],
    *,
    member_id: Optional[int] = None,
    account_id: Optional[int] = None,
) -> None:
    """Puts a new workspace member or ad account on the default team; rows must be flushed."""
    if workspace_id is None:
        return
    team = await default_team(session, workspace_id)
    if team is None:
        return
    if member_id is not None:
        exists = (
            await session.execute(
                select(func.count()).select_from(TeamMember)
                .where(TeamMember.team_id == team.id, TeamMember.member_id == member_id)
            )
        ).scalar_one()
        if not exists:
            session.add(TeamMember(team_id=team.id, member_id=member_id))
    if account_id is not None:
        exists = (
            await session.execute(
                select(func.count()).select_from(TeamAccount)
                .where(TeamAccount.team_id == team.id, TeamAccount.account_id == account_id)
            )
        ).scalar_one()
        if not exists:
            session.add(TeamAccount(team_id=team.id, account_id=account_id))
