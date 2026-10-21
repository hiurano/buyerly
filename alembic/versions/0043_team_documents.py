"""Documents on a team's Home, as Linear's team Documents.

Revision ID: 0043_team_documents
Revises: 0042_default_teams
Create Date: 2026-10-21 15:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0043_team_documents"
down_revision: Union[str, None] = "0042_default_teams"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "team_documents" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "team_documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "updated_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_team_documents_team_id", "team_documents", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_team_documents_team_id", table_name="team_documents")
    op.drop_table("team_documents")
