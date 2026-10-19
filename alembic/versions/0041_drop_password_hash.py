"""Sign-in is email-only, as in Linear: drop users.password_hash.

Revision ID: 0041_drop_password_hash
Revises: 0040_clear_unverified_emails
Create Date: 2026-10-20 19:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0041_drop_password_hash"
down_revision: Union[str, None] = "0040_clear_unverified_emails"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "password_hash" in columns:
        op.drop_column("users", "password_hash")


def downgrade() -> None:
    # The column comes back empty: every account is without a password.
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(), nullable=False, server_default=""),
    )
