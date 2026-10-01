"""Remember each member's Email notification settings, as Linear does.

Revision ID: 0030_notification_channels
Revises: 0029_inbox_display
Create Date: 2026-10-02 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0030_notification_channels"
down_revision: Union[str, None] = "0029_inbox_display"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("workspace_members")}
    if "notification_channels" in columns:
        return
    op.add_column("workspace_members", sa.Column("notification_channels", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("workspace_members", "notification_channels")
