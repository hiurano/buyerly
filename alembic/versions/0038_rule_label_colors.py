"""Rule groups become labels with a color, as Linear's labels (#383).

The old group icons pick the color: shield green, rocket purple, flask
amber, anything else gray.

Revision ID: 0038_rule_label_colors
Revises: 0037_view_settings
Create Date: 2026-10-11 18:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0038_rule_label_colors"
down_revision: Union[str, None] = "0037_view_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("rule_groups")}
    if "color" in columns:
        return
    op.add_column(
        "rule_groups",
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#95a2b3"),
    )
    op.execute(
        """
        UPDATE rule_groups SET color = CASE icon
            WHEN 'shield' THEN '#4cb782'
            WHEN 'rocket' THEN '#bb87fc'
            WHEN 'flask' THEN '#f2c94c'
            ELSE '#95a2b3'
        END
        """
    )


def downgrade() -> None:
    op.drop_column("rule_groups", "color")
