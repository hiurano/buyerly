"""Give every workspace without a team its default team.

Linear creates a team named after the workspace when the workspace is
created, and the sidebar's "Your teams" lists it. Workspaces made before
Buyerly did the same get that team now, with every member and every ad
account of the workspace on it.

Revision ID: 0042_default_teams
Revises: 0041_drop_password_hash
Create Date: 2026-10-21 12:00:00.000000+00:00
"""

import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0042_default_teams"
down_revision: Union[str, None] = "0041_drop_password_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _team_key(name: str) -> str:
    # The same rule as core.default_team.default_team_key, frozen here.
    letters = re.sub(r"[^A-Za-z0-9]", "", name).upper().lstrip("0123456789")
    return letters[:3] or "TEAM"


def upgrade() -> None:
    bind = op.get_bind()
    workspaces = bind.execute(
        sa.text(
            "SELECT w.id, w.name, w.owner_user_id FROM workspaces w "
            "WHERE NOT EXISTS (SELECT 1 FROM teams t WHERE t.workspace_id = w.id AND t.deleted_at IS NULL) "
            "ORDER BY w.id"
        )
    ).all()
    for workspace_id, name, owner_user_id in workspaces:
        team_name = " ".join((name or "").split())[:48] or "Team"
        team_id = bind.execute(
            sa.text(
                "INSERT INTO teams (workspace_id, name, key, description, created_by_user_id, created_at, updated_at) "
                "VALUES (:workspace_id, :name, :key, '', :owner, NOW(), NOW()) RETURNING id"
            ),
            {"workspace_id": workspace_id, "name": team_name, "key": _team_key(team_name), "owner": owner_user_id},
        ).scalar_one()
        bind.execute(
            sa.text(
                "INSERT INTO team_members (team_id, member_id, joined_at) "
                "SELECT :team_id, m.id, m.joined_at FROM workspace_members m WHERE m.workspace_id = :workspace_id"
            ),
            {"team_id": team_id, "workspace_id": workspace_id},
        )
        bind.execute(
            sa.text(
                "INSERT INTO team_accounts (team_id, account_id, created_at) "
                "SELECT :team_id, a.id, NOW() FROM accounts a WHERE a.workspace_id = :workspace_id"
            ),
            {"team_id": team_id, "workspace_id": workspace_id},
        )


def downgrade() -> None:
    # The teams made here look like any other team by now; they stay.
    pass
