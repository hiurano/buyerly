"""Drop what nothing reads: analytics_view_preferences, event_logs and app_settings.admin_chat_id.

analytics_view_preferences lost its only reader, /api/analytics-view, in #606;
nothing writes or reads event_logs;
admin_chat_id lost its last reader, the dev sign-in, in #609.

Revision ID: 0054_drop_unused_tables
Revises: 0053_desktop_push
Create Date: 2026-11-04 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0054_drop_unused_tables"
down_revision: Union[str, None] = "0053_desktop_push"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = inspector.get_table_names()
    for table in ("analytics_view_preferences", "event_logs"):
        if table in tables:
            op.drop_table(table)
    if "admin_chat_id" in {c["name"] for c in inspector.get_columns("app_settings")}:
        op.drop_column("app_settings", "admin_chat_id")


def downgrade() -> None:
    """Brings back the empty tables and column as 0001 made them; their rows are gone."""
    op.add_column(
        "app_settings",
        sa.Column("admin_chat_id", sa.String(), server_default="", nullable=False),
    )
    op.create_table(
        "analytics_view_preferences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("scope", sa.String(), nullable=False, index=True),
        sa.Column("config", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_user_id", "scope", name="uq_analytics_view_owner_scope"),
    )
    op.create_table(
        "event_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_type", sa.String(), nullable=False, index=True),
        sa.Column("target_chat_id", sa.String(), index=True),
        sa.Column("account_id", sa.String(), index=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )
