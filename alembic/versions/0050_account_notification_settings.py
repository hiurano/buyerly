"""Linear's bell on an ad account: which kinds of its events reach a member's Inbox.

Revision ID: 0050_account_notification_settings
Revises: 0049_favorites
Create Date: 2026-10-24 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0050_account_notification_settings"
down_revision: Union[str, None] = "0049_favorites"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "account_notification_settings" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "account_notification_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("workspace_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("account_id", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "member_id", "account_id", "kind", name="uq_account_notification_settings_member_kind"
        ),
    )
    op.create_index(
        "ix_account_notification_settings_member_id", "account_notification_settings", ["member_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_account_notification_settings_member_id", table_name="account_notification_settings")
    op.drop_table("account_notification_settings")
