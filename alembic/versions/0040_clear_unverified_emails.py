"""Free account emails nobody confirmed.

An account's email that was never confirmed (email_verified_at IS NULL) was
set without proof the address is the account holder's. Sign-in by email code
no longer accepts such rows, so the address is cleared: its real owner can
then sign up with it.

Revision ID: 0040_clear_unverified_emails
Revises: 0039_drop_allowed_emails
Create Date: 2026-10-20 18:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0040_clear_unverified_emails"
down_revision: Union[str, None] = "0039_drop_allowed_emails"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE users SET email = NULL "
        "WHERE email IS NOT NULL AND email_verified_at IS NULL"
    )


def downgrade() -> None:
    # The cleared addresses were never confirmed and are not kept anywhere.
    pass
