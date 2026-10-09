"""A job title on the profile, as Linear's Settings → Profile has it (#368).

Revision ID: 0035_user_title
Revises: 0034_web_session_location
Create Date: 2026-10-09 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0035_user_title"
down_revision: Union[str, None] = "0034_web_session_location"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "title" in columns:
        return
    op.add_column(
        "users",
        sa.Column("title", sa.String(length=128), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("users", "title")
