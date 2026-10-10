"""Settings → Administration → Teams, as Linear's (#371).

A team gathers workspace members and the ad accounts they work on. Every
member of the workspace can read the teams; the owner and admins create,
change, retire, delete and restore them and choose who and what is on them.
A team member may also leave it. Deleting keeps the team restorable for
TEAM_RESTORE_DAYS, like Linear's "Recently deleted".
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from api.auth import get_current_user
from api.deps import _utc_iso, get_user_workspace_member
from api.schemas import (
    CreateTeamRequest,
    TeamAccountsRequest,
    TeamItem,
    TeamMembersRequest,
    UpdateTeamRequest,
)
from database.db import async_session_maker
from database.models import Account, Team, TeamAccount, TeamMember, User, WorkspaceMember

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Teams"])

TEAM_RESTORE_DAYS = 30
TEAM_KEY_PATTERN = re.compile(r"^[A-Z][A-Z0-9]{0,6}$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clean_name(value: str) -> str:
    name = " ".join(value.split())
    if not name:
        raise HTTPException(status_code=400, detail="Team name can't be empty")
    return name


def _clean_key(value: str) -> str:
    key = value.strip().upper()
    if not key:
        raise HTTPException(status_code=400, detail="Team identifier can't be empty")
    if not TEAM_KEY_PATTERN.match(key):
        raise HTTPException(
            status_code=400,
            detail="Team identifier must be 1–7 letters or digits and start with a letter",
        )
    return key


async def _workspace_role(session, user: User, workspace_id: int) -> WorkspaceMember:
    ws, member = await get_user_workspace_member(session, user, workspace_id=workspace_id)
    if not ws or not member:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return member


def _require_admin(member: WorkspaceMember) -> None:
    if member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only workspace owners and admins can manage teams")


async def _purge_expired(session, workspace_id: int) -> None:
    cutoff = _now() - timedelta(days=TEAM_RESTORE_DAYS)
    await session.execute(
        delete(Team).where(
            Team.workspace_id == workspace_id,
            Team.deleted_at.is_not(None),
            Team.deleted_at < cutoff,
        )
    )


async def _load_team(session, workspace_id: int, team_id: int, *, deleted: bool = False) -> Team:
    team = (
        await session.execute(
            select(Team).where(
                Team.id == team_id,
                Team.workspace_id == workspace_id,
                Team.deleted_at.is_not(None) if deleted else Team.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


async def _ensure_unique(session, workspace_id: int, name: str, key: str, exclude_id: Optional[int] = None) -> None:
    """Linear's own messages for a name or identifier another team already uses."""
    base = select(Team.id).where(Team.workspace_id == workspace_id, Team.deleted_at.is_(None))
    if exclude_id is not None:
        base = base.where(Team.id != exclude_id)
    if (await session.execute(base.where(func.lower(Team.name) == name.lower()))).first():
        raise HTTPException(status_code=409, detail="A team with this name already exists")
    if (await session.execute(base.where(func.upper(Team.key) == key))).first():
        raise HTTPException(status_code=409, detail="A team with this identifier already exists")


async def _team_items(session, teams: List[Team], user: User) -> List[TeamItem]:
    ids = [team.id for team in teams]
    members: dict[int, List[int]] = {team_id: [] for team_id in ids}
    accounts: dict[int, List[int]] = {team_id: [] for team_id in ids}
    if ids:
        member_rows = (
            await session.execute(
                select(TeamMember.team_id, WorkspaceMember.user_id)
                .join(WorkspaceMember, WorkspaceMember.id == TeamMember.member_id)
                .where(TeamMember.team_id.in_(ids))
                .order_by(TeamMember.joined_at.asc(), TeamMember.id.asc())
            )
        ).all()
        for team_id, user_id in member_rows:
            members[team_id].append(user_id)
        account_rows = (
            await session.execute(
                select(TeamAccount.team_id, TeamAccount.account_id)
                .where(TeamAccount.team_id.in_(ids))
                .order_by(TeamAccount.created_at.asc(), TeamAccount.id.asc())
            )
        ).all()
        for team_id, account_id in account_rows:
            accounts[team_id].append(account_id)
    return [
        TeamItem(
            id=team.id,
            name=team.name,
            key=team.key,
            description=team.description or "",
            created_at=_utc_iso(team.created_at),
            retired_at=_utc_iso(team.retired_at) or None,
            deleted_at=_utc_iso(team.deleted_at) or None,
            restorable_until=(
                _utc_iso(team.deleted_at + timedelta(days=TEAM_RESTORE_DAYS)) if team.deleted_at else None
            ),
            member_user_ids=members[team.id],
            account_ids=accounts[team.id],
            is_member=user.id in members[team.id],
        )
        for team in teams
    ]


async def _team_item(session, team: Team, user: User) -> TeamItem:
    return (await _team_items(session, [team], user))[0]


async def _commit_unique(session) -> None:
    """Two admins saving the same name at once: the index decides, the loser gets the same 409."""
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(status_code=409, detail="A team with this name or identifier already exists") from error


@router.get("/workspaces/{workspace_id}/teams", response_model=List[TeamItem])
async def list_teams(
    workspace_id: int,
    status: str = Query("all", pattern="^(all|active|retired|deleted)$"),
    user: User = Depends(get_current_user),
):
    """Teams by Linear's filter: Active, Retired or Recently deleted; "all" is every team not deleted."""
    async with async_session_maker() as session:
        await _workspace_role(session, user, workspace_id)
        await _purge_expired(session, workspace_id)
        await session.commit()
        stmt = select(Team).where(Team.workspace_id == workspace_id)
        if status == "deleted":
            stmt = stmt.where(Team.deleted_at.is_not(None)).order_by(Team.deleted_at.desc())
        else:
            stmt = stmt.where(Team.deleted_at.is_(None))
            if status == "active":
                stmt = stmt.where(Team.retired_at.is_(None))
            elif status == "retired":
                stmt = stmt.where(Team.retired_at.is_not(None))
            stmt = stmt.order_by(func.lower(Team.name).asc(), Team.id.asc())
        teams = (await session.execute(stmt)).scalars().all()
        return await _team_items(session, list(teams), user)


@router.post("/workspaces/{workspace_id}/teams", response_model=TeamItem, status_code=201)
async def create_team(
    workspace_id: int,
    req: CreateTeamRequest,
    user: User = Depends(get_current_user),
):
    """Linear's Create team: name and identifier; whoever creates it joins it."""
    async with async_session_maker() as session:
        member = await _workspace_role(session, user, workspace_id)
        _require_admin(member)
        name = _clean_name(req.name)
        key = _clean_key(req.key)
        await _ensure_unique(session, workspace_id, name, key)
        team = Team(
            workspace_id=workspace_id,
            name=name,
            key=key,
            description=req.description.strip(),
            created_by_user_id=user.id,
        )
        session.add(team)
        await session.flush()
        # A support session's member is not a real row: it creates the team without joining it.
        if member.id is not None:
            session.add(TeamMember(team_id=team.id, member_id=member.id))
        await _commit_unique(session)
        return await _team_item(session, team, user)


@router.patch("/workspaces/{workspace_id}/teams/{team_id}", response_model=TeamItem)
async def update_team(
    workspace_id: int,
    team_id: int,
    req: UpdateTeamRequest,
    user: User = Depends(get_current_user),
):
    """General: name, identifier and description, each saved on its own."""
    async with async_session_maker() as session:
        member = await _workspace_role(session, user, workspace_id)
        _require_admin(member)
        team = await _load_team(session, workspace_id, team_id)
        name = _clean_name(req.name) if req.name is not None else team.name
        key = _clean_key(req.key) if req.key is not None else team.key
        await _ensure_unique(session, workspace_id, name, key, exclude_id=team.id)
        team.name = name
        team.key = key
        if req.description is not None:
            team.description = req.description.strip()
        team.updated_at = _now()
        await _commit_unique(session)
        return await _team_item(session, team, user)


@router.post("/workspaces/{workspace_id}/teams/{team_id}/retire", response_model=TeamItem)
async def retire_team(workspace_id: int, team_id: int, user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        _require_admin(await _workspace_role(session, user, workspace_id))
        team = await _load_team(session, workspace_id, team_id)
        if team.retired_at is None:
            team.retired_at = _now()
            await session.commit()
        return await _team_item(session, team, user)


@router.post("/workspaces/{workspace_id}/teams/{team_id}/restore", response_model=TeamItem)
async def restore_team(workspace_id: int, team_id: int, user: User = Depends(get_current_user)):
    """Linear's Restore team: a retired team becomes active, a deleted one comes back as it was."""
    async with async_session_maker() as session:
        _require_admin(await _workspace_role(session, user, workspace_id))
        await _purge_expired(session, workspace_id)
        team = (
            await session.execute(
                select(Team).where(Team.id == team_id, Team.workspace_id == workspace_id)
            )
        ).scalar_one_or_none()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        if team.deleted_at is not None:
            await _ensure_unique(session, workspace_id, team.name, team.key.upper(), exclude_id=team.id)
            team.deleted_at = None
        else:
            team.retired_at = None
        await _commit_unique(session)
        return await _team_item(session, team, user)


@router.delete("/workspaces/{workspace_id}/teams/{team_id}")
async def delete_team(workspace_id: int, team_id: int, user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        _require_admin(await _workspace_role(session, user, workspace_id))
        team = await _load_team(session, workspace_id, team_id)
        team.deleted_at = _now()
        await session.commit()
        return {
            "status": "ok",
            "restorable_until": _utc_iso(team.deleted_at + timedelta(days=TEAM_RESTORE_DAYS)),
        }


@router.post("/workspaces/{workspace_id}/teams/{team_id}/members", response_model=TeamItem)
async def add_team_members(
    workspace_id: int,
    team_id: int,
    req: TeamMembersRequest,
    user: User = Depends(get_current_user),
):
    """Linear's "Add members to <team>": workspace members only; those already on it are skipped."""
    async with async_session_maker() as session:
        _require_admin(await _workspace_role(session, user, workspace_id))
        team = await _load_team(session, workspace_id, team_id)
        wanted = set(req.user_ids)
        rows = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id.in_(wanted),
                )
            )
        ).scalars().all()
        if len(rows) != len(wanted):
            raise HTTPException(status_code=400, detail="Only members of this workspace can join its teams")
        present = set(
            (
                await session.execute(
                    select(TeamMember.member_id).where(
                        TeamMember.team_id == team.id,
                        TeamMember.member_id.in_([row.id for row in rows]),
                    )
                )
            ).scalars().all()
        )
        for row in rows:
            if row.id not in present:
                session.add(TeamMember(team_id=team.id, member_id=row.id))
        try:
            await session.commit()
        except IntegrityError:
            # Someone added the same people a moment earlier: they are on the team either way.
            await session.rollback()
            team = await _load_team(session, workspace_id, team_id)
        return await _team_item(session, team, user)


@router.delete("/workspaces/{workspace_id}/teams/{team_id}/members/{member_user_id}", response_model=TeamItem)
async def remove_team_member(
    workspace_id: int,
    team_id: int,
    member_user_id: int,
    user: User = Depends(get_current_user),
):
    """Remove from team; anyone may take themselves off a team (Linear's Leave team…)."""
    async with async_session_maker() as session:
        member = await _workspace_role(session, user, workspace_id)
        if member_user_id != user.id:
            _require_admin(member)
        team = await _load_team(session, workspace_id, team_id)
        target = (
            await session.execute(
                select(WorkspaceMember.id).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == member_user_id,
                )
            )
        ).scalar_one_or_none()
        if target is None:
            raise HTTPException(status_code=404, detail="Member not found in this workspace")
        result = await session.execute(
            delete(TeamMember).where(TeamMember.team_id == team.id, TeamMember.member_id == target)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Not a member of this team")
        await session.commit()
        return await _team_item(session, team, user)


@router.post("/workspaces/{workspace_id}/teams/{team_id}/accounts", response_model=TeamItem)
async def add_team_accounts(
    workspace_id: int,
    team_id: int,
    req: TeamAccountsRequest,
    user: User = Depends(get_current_user),
):
    """Ad accounts the team works on: only this workspace's own; those already on it are skipped."""
    async with async_session_maker() as session:
        _require_admin(await _workspace_role(session, user, workspace_id))
        team = await _load_team(session, workspace_id, team_id)
        wanted = set(req.account_ids)
        found = set(
            (
                await session.execute(
                    select(Account.id).where(Account.workspace_id == workspace_id, Account.id.in_(wanted))
                )
            ).scalars().all()
        )
        if found != wanted:
            raise HTTPException(status_code=400, detail="Only this workspace's ad accounts can be added to its teams")
        present = set(
            (
                await session.execute(
                    select(TeamAccount.account_id).where(
                        TeamAccount.team_id == team.id,
                        TeamAccount.account_id.in_(found),
                    )
                )
            ).scalars().all()
        )
        for account_id in sorted(found - present):
            session.add(TeamAccount(team_id=team.id, account_id=account_id))
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            team = await _load_team(session, workspace_id, team_id)
        return await _team_item(session, team, user)


@router.delete("/workspaces/{workspace_id}/teams/{team_id}/accounts/{account_pk}", response_model=TeamItem)
async def remove_team_account(
    workspace_id: int,
    team_id: int,
    account_pk: int,
    user: User = Depends(get_current_user),
):
    async with async_session_maker() as session:
        _require_admin(await _workspace_role(session, user, workspace_id))
        team = await _load_team(session, workspace_id, team_id)
        result = await session.execute(
            delete(TeamAccount).where(TeamAccount.team_id == team.id, TeamAccount.account_id == account_pk)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="This ad account is not on the team")
        await session.commit()
        return await _team_item(session, team, user)
