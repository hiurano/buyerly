"""Desktop notifications (#503): each browser's Web Push subscription, and what was pushed to whom.

Revision ID: 0053_desktop_push
Revises: 0052_sync_notify
Create Date: 2026-10-28 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0053_desktop_push"
down_revision: Union[str, None] = "0052_sync_notify"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tables = sa.inspect(op.get_bind()).get_table_names()
    if "desktop_push_subscriptions" not in tables:
        op.create_table(
            "desktop_push_subscriptions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "member_id",
                sa.Integer(),
                sa.ForeignKey("workspace_members.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "web_session_id",
                sa.String(36),
                sa.ForeignKey("web_sessions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("endpoint", sa.Text(), nullable=False),
            sa.Column("p256dh", sa.String(), nullable=False),
            sa.Column("auth", sa.String(), nullable=False),
            sa.Column("user_agent", sa.String(500), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("member_id", "endpoint", name="uq_desktop_push_member_endpoint"),
        )
        for column in ("member_id", "web_session_id", "endpoint"):
            op.create_index(f"ix_desktop_push_subscriptions_{column}", "desktop_push_subscriptions", [column])
    if "inbox_push_deliveries" not in tables:
        op.create_table(
            "inbox_push_deliveries",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "audit_event_id",
                sa.Integer(),
                sa.ForeignKey("audit_events.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("user_id", "audit_event_id", name="uq_inbox_push_user_event"),
        )
        op.create_index("ix_inbox_push_deliveries_user_id", "inbox_push_deliveries", ["user_id"])
        op.create_index("ix_inbox_push_deliveries_audit_event_id", "inbox_push_deliveries", ["audit_event_id"])


def downgrade() -> None:
    tables = sa.inspect(op.get_bind()).get_table_names()
    for table in ("inbox_push_deliveries", "desktop_push_subscriptions"):
        if table in tables:
            op.drop_table(table)
