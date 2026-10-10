"""Teams inside a workspace, their members and ad accounts, as Linear's Settings → Teams (#371).

Revision ID: 0036_teams
Revises: 0035_user_title
Create Date: 2026-10-10 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0036_teams"
down_revision: Union[str, None] = "0035_user_title"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "teams" not in existing:
        op.create_table(
            "teams",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "workspace_id",
                sa.Integer(),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(48), nullable=False),
            sa.Column("key", sa.String(7), nullable=False),
            sa.Column("description", sa.String(255), nullable=False, server_default=""),
            sa.Column(
                "created_by_user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_teams_workspace_id", "teams", ["workspace_id"])
        op.create_index("ix_teams_deleted_at", "teams", ["deleted_at"])
        op.create_index(
            "uq_teams_workspace_key",
            "teams",
            ["workspace_id", sa.text("upper(key)")],
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
        )
        op.create_index(
            "uq_teams_workspace_name",
            "teams",
            ["workspace_id", sa.text("lower(name)")],
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
        )

    if "team_members" not in existing:
        op.create_table(
            "team_members",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column(
                "member_id",
                sa.Integer(),
                sa.ForeignKey("workspace_members.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("team_id", "member_id", name="uq_team_member"),
        )
        op.create_index("ix_team_members_team_id", "team_members", ["team_id"])
        op.create_index("ix_team_members_member_id", "team_members", ["member_id"])

    if "team_accounts" not in existing:
        op.create_table(
            "team_accounts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column(
                "account_id",
                sa.Integer(),
                sa.ForeignKey("accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("team_id", "account_id", name="uq_team_account"),
        )
        op.create_index("ix_team_accounts_team_id", "team_accounts", ["team_id"])
        op.create_index("ix_team_accounts_account_id", "team_accounts", ["account_id"])


def downgrade() -> None:
    op.drop_table("team_accounts")
    op.drop_table("team_members")
    op.drop_table("teams")
