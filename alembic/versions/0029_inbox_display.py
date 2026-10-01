"""Remember each member's Inbox Display options, as Linear does.

Revision ID: 0029_inbox_display
Revises: 0028_inbox_notification_states
Create Date: 2026-10-01 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0029_inbox_display"
down_revision: Union[str, None] = "0028_inbox_notification_states"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("workspace_members")}
    if "inbox_display" in columns:
        return
    op.add_column("workspace_members", sa.Column("inbox_display", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("workspace_members", "inbox_display")
