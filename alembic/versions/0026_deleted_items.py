"""Keep deleted rules and rule groups restorable for 30 days.

Revision ID: 0026_deleted_items
Revises: 0025_account_cost_target
Create Date: 2026-09-25 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0026_deleted_items"
down_revision: Union[str, None] = "0025_account_cost_target"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "deleted_items" in inspector.get_table_names():
        return

    # Nothing deleted before this revision was kept, so there is no backfill:
    # the trash starts empty.
    op.create_table(
        "deleted_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "workspace_id",
            sa.Integer(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False, server_default=""),
        sa.Column(
            "snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "deleted_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_deleted_items_workspace_id", "deleted_items", ["workspace_id"])
    op.create_index("ix_deleted_items_deleted_at", "deleted_items", ["deleted_at"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "deleted_items" not in inspector.get_table_names():
        return
    op.drop_index("ix_deleted_items_deleted_at", table_name="deleted_items")
    op.drop_index("ix_deleted_items_workspace_id", table_name="deleted_items")
    op.drop_table("deleted_items")
