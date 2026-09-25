"""Let the allowlist grant access to an existing account by user id.

Revision ID: 0027_allowlist_user_grants
Revises: 0026_deleted_items
Create Date: 2026-09-25 18:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0027_allowlist_user_grants"
down_revision: Union[str, None] = "0026_deleted_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("allowed_emails")}
    if "user_id" in columns:
        return

    # Existing rows are all email grants and keep working unchanged.
    op.add_column("allowed_emails", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_allowed_emails_user_id",
        "allowed_emails",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_allowed_emails_user_id", "allowed_emails", ["user_id"], unique=True)
    op.alter_column("allowed_emails", "email", existing_type=sa.String(length=320), nullable=True)
    op.create_check_constraint(
        "ck_allowed_emails_email_xor_user",
        "allowed_emails",
        "(email IS NULL) <> (user_id IS NULL)",
    )


def downgrade() -> None:
    # Account grants have no email to fall back to; dropping them is the only
    # way back to the email-only schema.
    op.execute("DELETE FROM allowed_emails WHERE user_id IS NOT NULL")
    op.drop_constraint("ck_allowed_emails_email_xor_user", "allowed_emails", type_="check")
    op.alter_column("allowed_emails", "email", existing_type=sa.String(length=320), nullable=False)
    op.drop_index("ix_allowed_emails_user_id", table_name="allowed_emails")
    op.drop_constraint("fk_allowed_emails_user_id", "allowed_emails", type_="foreignkey")
    op.drop_column("allowed_emails", "user_id")
