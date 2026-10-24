"""Linear's favorites: pages and records a member pins to the sidebar.

Revision ID: 0049_favorites
Revises: 0048_workspace_view_defaults
Create Date: 2026-10-24 08:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0049_favorites"
down_revision: Union[str, None] = "0048_workspace_view_defaults"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "favorites" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "favorites",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("workspace_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("path", sa.String(300), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("member_id", "path", name="uq_favorites_member_path"),
    )
    op.create_index("ix_favorites_member_id", "favorites", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_favorites_member_id", table_name="favorites")
    op.drop_table("favorites")
