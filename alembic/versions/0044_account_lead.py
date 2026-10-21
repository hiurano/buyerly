"""The buyer responsible for each ad account, as a Linear project's lead.

Whoever connected an account leads it, when they are still in its workspace.

Revision ID: 0044_account_lead
Revises: 0043_team_documents
Create Date: 2026-10-21 18:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0044_account_lead"
down_revision: Union[str, None] = "0043_team_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("accounts")}
    if "lead_user_id" not in columns:
        op.add_column(
            "accounts",
            sa.Column("lead_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        )
        op.create_index("ix_accounts_lead_user_id", "accounts", ["lead_user_id"])
    op.execute(
        "UPDATE accounts SET lead_user_id = owner_user_id "
        "WHERE lead_user_id IS NULL AND owner_user_id IS NOT NULL AND EXISTS ("
        "SELECT 1 FROM workspace_members m "
        "WHERE m.workspace_id = accounts.workspace_id AND m.user_id = accounts.owner_user_id)"
    )


def downgrade() -> None:
    op.drop_index("ix_accounts_lead_user_id", table_name="accounts")
    op.drop_column("accounts", "lead_user_id")
