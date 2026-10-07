"""Remember where each browser session was last seen, as Linear shows it (#301).

Revision ID: 0034_web_session_location
Revises: 0033_rule_entity_states
Create Date: 2026-10-07 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0034_web_session_location"
down_revision: Union[str, None] = "0033_rule_entity_states"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("web_sessions")}
    if "location" in columns:
        return
    op.add_column(
        "web_sessions",
        sa.Column("location", sa.String(length=128), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("web_sessions", "location")
