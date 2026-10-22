"""Account groups are gone: ad accounts belong to teams (#458, #469).

Revision ID: 0047_drop_account_groups
Revises: 0046_private_teams
Create Date: 2026-10-22 18:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0047_drop_account_groups"
down_revision: Union[str, None] = "0046_private_teams"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS account_group_members")
    op.execute("DROP TABLE IF EXISTS account_groups")


def downgrade() -> None:
    # The tables come back empty, as 0012 left them; the groups themselves are not restored.
    op.create_table(
        "account_groups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_account_groups_workspace_name_ci "
        "ON account_groups (workspace_id, lower(btrim(name))) "
        "WHERE workspace_id IS NOT NULL"
    )
    op.create_table(
        "account_group_members",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("account_groups.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("group_id", "account_id", name="uq_account_group_member"),
    )
