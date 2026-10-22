"""Which ad accounts a workspace member may see, as Linear's teams decide.

In Linear, a public team's issues are visible to every member of the
workspace, a private team's only to its members, and a guest sees nothing but
the teams they were added to. Buyerly's ad accounts take the place of issues:

- an account on at least one public team, or on no team, is visible to every
  member who is not a guest;
- an account only on private teams is visible to the members of those teams,
  whatever their workspace role — admins and owners join a private team to see
  inside it, as in Linear;
- a guest sees only the accounts of the teams they are on.
"""

from dataclasses import dataclass, field
from typing import Optional, Set

from sqlalchemy import select

from database.models import Account, Team, TeamAccount, TeamMember, WorkspaceMember


@dataclass(frozen=True)
class AccountAccess:
    """`everything`: no account is hidden; otherwise only the listed ones are visible."""

    everything: bool
    pks: Set[int] = field(default_factory=set)
    act_ids: Set[str] = field(default_factory=set)

    def allows_pk(self, pk: Optional[int]) -> bool:
        return self.everything or (pk is not None and pk in self.pks)

    def allows(self, act_id: Optional[str]) -> bool:
        return self.everything or bool(act_id) and act_id in self.act_ids


EVERYTHING = AccountAccess(everything=True)


async def account_access(session, member: Optional[WorkspaceMember], workspace_id: Optional[int]) -> AccountAccess:
    """The accounts `member` sees in `workspace_id`; no membership row (a support session) sees everything."""
    if workspace_id is None or member is None or member.id is None:
        return EVERYTHING
    is_guest = member.role == "guest"
    has_private = (
        await session.execute(
            select(Team.id).where(
                Team.workspace_id == workspace_id, Team.deleted_at.is_(None), Team.private.is_(True)
            ).limit(1)
        )
    ).first()
    if not is_guest and not has_private:
        return EVERYTHING

    my_teams = set(
        (
            await session.execute(
                select(TeamMember.team_id)
                .join(Team, Team.id == TeamMember.team_id)
                .where(TeamMember.member_id == member.id, Team.workspace_id == workspace_id, Team.deleted_at.is_(None))
            )
        ).scalars().all()
    )
    links = (
        await session.execute(
            select(TeamAccount.account_id, Team.id, Team.private)
            .join(Team, Team.id == TeamAccount.team_id)
            .where(Team.workspace_id == workspace_id, Team.deleted_at.is_(None))
        )
    ).all()
    teams_of: dict[int, list[tuple[int, bool]]] = {}
    for account_pk, team_id, private in links:
        teams_of.setdefault(account_pk, []).append((team_id, bool(private)))

    accounts = (
        await session.execute(select(Account.id, Account.account_id).where(Account.workspace_id == workspace_id))
    ).all()
    pks: Set[int] = set()
    act_ids: Set[str] = set()
    for pk, act_id in accounts:
        teams = teams_of.get(pk, [])
        if is_guest:
            visible = any(team_id in my_teams for team_id, _ in teams)
        else:
            visible = (
                not teams
                or any(not private for _, private in teams)
                or any(team_id in my_teams for team_id, _ in teams)
            )
        if visible:
            pks.add(pk)
            act_ids.add(act_id)
    return AccountAccess(everything=False, pks=pks, act_ids=act_ids)
