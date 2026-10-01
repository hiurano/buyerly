"""Remember which Inbox notifications were emailed to whom, so none goes out twice.

Revision ID: 0031_inbox_email_deliveries
Revises: 0030_notification_channels
Create Date: 2026-10-02 18:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0031_inbox_email_deliveries"
down_revision: Union[str, None] = "0030_notification_channels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "inbox_email_deliveries" in inspector.get_table_names():
        return

    op.create_table(
        "inbox_email_deliveries",
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
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", "audit_event_id", name="uq_inbox_email_user_event"),
    )
    op.create_index("ix_inbox_email_deliveries_user_id", "inbox_email_deliveries", ["user_id"])
    op.create_index(
        "ix_inbox_email_deliveries_audit_event_id", "inbox_email_deliveries", ["audit_event_id"]
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "inbox_email_deliveries" not in inspector.get_table_names():
        return
    op.drop_table("inbox_email_deliveries")
