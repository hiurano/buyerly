"""Linear's private teams: only their members see them and their ad accounts.

Revision ID: 0046_private_teams
Revises: 0045_linear_roles
Create Date: 2026-10-22 14:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0046_private_teams"
down_revision: Union[str, None] = "0045_linear_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("teams")}
    if "private" not in columns:
        op.add_column("teams", sa.Column("private", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("teams", "private")
