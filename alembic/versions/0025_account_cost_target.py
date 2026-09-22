"""Let an ad account declare its primary result and the cost it is worth buying at.

Revision ID: 0025_account_cost_target
Revises: 0024_rule_execution_levels
Create Date: 2026-09-22 17:10:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0025_account_cost_target"
down_revision: Union[str, None] = "0024_rule_execution_levels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("accounts")}

    # No existing ad account has declared anything, so the backfill is the
    # undeclared state: Statistics keeps reporting cost without a verdict until
    # a buyer sets a target explicitly.
    if "primary_result" not in columns:
        op.add_column(
            "accounts",
            sa.Column(
                "primary_result",
                sa.String(),
                nullable=False,
                server_default="",
            ),
        )
    if "target_cost_per_result" not in columns:
        op.add_column(
            "accounts",
            sa.Column("target_cost_per_result", sa.Float(), nullable=True),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("accounts")}

    if "target_cost_per_result" in columns:
        op.drop_column("accounts", "target_cost_per_result")
    if "primary_result" in columns:
        op.drop_column("accounts", "primary_result")
