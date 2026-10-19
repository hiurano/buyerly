"""Sign-up is open to everyone: drop the allowlist (#436).

Revision ID: 0039_drop_allowed_emails
Revises: 0038_rule_label_colors
Create Date: 2026-10-20 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0039_drop_allowed_emails"
down_revision: Union[str, None] = "0038_rule_label_colors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "allowed_emails" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("allowed_emails")


def downgrade() -> None:
    # The table comes back as 0027 left it, but empty: the grants are gone, and
    # with them the closed access, until an administrator adds them again.
    op.create_table(
        "allowed_emails",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("added_by", sa.String(length=128), nullable=True),
        sa.Column("comment", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_allowed_emails_user_id",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "(email IS NULL) <> (user_id IS NULL)",
            name="ck_allowed_emails_email_xor_user",
        ),
    )
    op.create_index("ix_allowed_emails_email", "allowed_emails", ["email"], unique=True)
    op.create_index("ix_allowed_emails_user_id", "allowed_emails", ["user_id"], unique=True)
