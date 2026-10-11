"""Remember each member's list views, as Linear does (#385).

Revision ID: 0037_view_settings
Revises: 0036_teams
Create Date: 2026-10-11 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0037_view_settings"
down_revision: Union[str, None] = "0036_teams"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "view_settings" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "view_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("workspace_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("view_key", sa.String(64), nullable=False),
        sa.Column("settings", JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("member_id", "view_key", name="uq_view_settings_member_key"),
    )
    op.create_index("ix_view_settings_member_id", "view_settings", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_view_settings_member_id", table_name="view_settings")
    op.drop_table("view_settings")
