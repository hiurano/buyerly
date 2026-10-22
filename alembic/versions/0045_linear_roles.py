"""Linear's roles: Owner, Admin, Member, Guest, and team owners.

Buyer becomes Member. Viewer, which Linear has no counterpart for, becomes
Guest. A team's creator becomes its owner, as in Linear.

Revision ID: 0045_linear_roles
Revises: 0044_account_lead
Create Date: 2026-10-22 10:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0045_linear_roles"
down_revision: Union[str, None] = "0044_account_lead"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROLE_TABLES = ("workspace_members", "workspace_invites", "workspace_support_grants")


def _rename_roles(pairs) -> None:
    for table in ROLE_TABLES:
        for old, new in pairs:
            op.execute(f"UPDATE {table} SET role = '{new}' WHERE role = '{old}'")


def upgrade() -> None:
    _rename_roles((("buyer", "member"), ("viewer", "guest")))
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("team_members")}
    if "is_owner" not in columns:
        op.add_column(
            "team_members",
            sa.Column("is_owner", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    op.execute(
        "UPDATE team_members SET is_owner = true FROM teams, workspace_members "
        "WHERE teams.id = team_members.team_id AND workspace_members.id = team_members.member_id "
        "AND workspace_members.user_id = teams.created_by_user_id AND workspace_members.role <> 'guest'"
    )


def downgrade() -> None:
    op.drop_column("team_members", "is_owner")
    _rename_roles((("member", "buyer"), ("guest", "viewer")))
