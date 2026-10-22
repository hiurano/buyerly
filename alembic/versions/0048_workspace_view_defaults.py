"""Linear's "Set default for everyone": a workspace's default view per list page (#472).

Revision ID: 0048_workspace_view_defaults
Revises: 0047_drop_account_groups
Create Date: 2026-10-22 19:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0048_workspace_view_defaults"
down_revision: Union[str, None] = "0047_drop_account_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "workspace_view_defaults" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "workspace_view_defaults",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "workspace_id",
            sa.Integer(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("view_key", sa.String(64), nullable=False),
        sa.Column("settings", JSONB(), nullable=False),
        sa.Column(
            "updated_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "view_key", name="uq_workspace_view_defaults_key"),
    )
    op.create_index("ix_workspace_view_defaults_workspace_id", "workspace_view_defaults", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_workspace_view_defaults_workspace_id", table_name="workspace_view_defaults")
    op.drop_table("workspace_view_defaults")
