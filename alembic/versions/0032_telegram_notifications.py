"""Personal Telegram accounts, their one-time link tokens and sent Telegram notifications.

Revision ID: 0032_telegram_notifications
Revises: 0031_inbox_email_deliveries
Create Date: 2026-10-02 20:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0032_telegram_notifications"
down_revision: Union[str, None] = "0031_inbox_email_deliveries"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("inbox_telegram_deliveries", "telegram_link_tokens", "telegram_connections")


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "telegram_connections" not in existing:
        op.create_table(
            "telegram_connections",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "member_id",
                sa.Integer(),
                sa.ForeignKey("workspace_members.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("chat_id", sa.BigInteger(), nullable=False),
            sa.Column("username", sa.String(), nullable=True),
            sa.Column("first_name", sa.String(), nullable=True),
            sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("delivery_error", sa.String(), nullable=True),
            sa.Column("delivery_error_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_telegram_connections_chat_id", "telegram_connections", ["chat_id"])

    if "telegram_link_tokens" not in existing:
        op.create_table(
            "telegram_link_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "member_id",
                sa.Integer(),
                sa.ForeignKey("workspace_members.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_telegram_link_tokens_member_id", "telegram_link_tokens", ["member_id"])

    if "inbox_telegram_deliveries" not in existing:
        op.create_table(
            "inbox_telegram_deliveries",
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
            sa.Column("chat_id", sa.BigInteger(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("user_id", "audit_event_id", name="uq_inbox_telegram_user_event"),
        )
        op.create_index("ix_inbox_telegram_deliveries_user_id", "inbox_telegram_deliveries", ["user_id"])
        op.create_index(
            "ix_inbox_telegram_deliveries_audit_event_id", "inbox_telegram_deliveries", ["audit_event_id"]
        )


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    for table in TABLES:
        if table in existing:
            op.drop_table(table)
