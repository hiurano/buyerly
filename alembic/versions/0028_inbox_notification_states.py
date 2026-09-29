"""Per-member Inbox state: read, deleted and snoozed notifications.

Revision ID: 0028_inbox_notification_states
Revises: 0027_allowlist_user_grants
Create Date: 2026-09-30 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0028_inbox_notification_states"
down_revision: Union[str, None] = "0027_allowlist_user_grants"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("workspace_members")}
    if "inbox_read_before" not in columns:
        # Everything recorded before this release counts as read, so nobody
        # opens Inbox to hundreds of old unread events.
        op.add_column(
            "workspace_members",
            sa.Column(
                "inbox_read_before",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.add_column(
            "workspace_members",
            sa.Column("inbox_deleted_before", sa.DateTime(timezone=True), nullable=True),
        )

    if "inbox_notification_states" in inspector.get_table_names():
        return
    op.create_table(
        "inbox_notification_states",
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
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("snoozed_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("user_id", "audit_event_id", name="uq_inbox_state_user_event"),
    )
    op.create_index(
        "ix_inbox_notification_states_user_id", "inbox_notification_states", ["user_id"]
    )
    op.create_index(
        "ix_inbox_notification_states_audit_event_id",
        "inbox_notification_states",
        ["audit_event_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_inbox_notification_states_audit_event_id", table_name="inbox_notification_states"
    )
    op.drop_index("ix_inbox_notification_states_user_id", table_name="inbox_notification_states")
    op.drop_table("inbox_notification_states")
    op.drop_column("workspace_members", "inbox_deleted_before")
    op.drop_column("workspace_members", "inbox_read_before")
