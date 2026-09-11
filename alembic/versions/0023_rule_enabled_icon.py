"""Give rule presets an on/off switch and rule groups a visual marker.

Revision ID: 0023_rule_enabled_icon
Revises: 0022_login_magic_links
Create Date: 2026-09-12 10:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0023_rule_enabled_icon"
down_revision: Union[str, None] = "0022_login_magic_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    preset_columns = {column["name"] for column in inspector.get_columns("rule_presets")}
    group_columns = {column["name"] for column in inspector.get_columns("rule_groups")}

    if "enabled" not in preset_columns:
        op.add_column(
            "rule_presets",
            sa.Column(
                "enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
    if "icon" not in group_columns:
        op.add_column(
            "rule_groups",
            sa.Column(
                "icon",
                sa.String(length=32),
                nullable=False,
                server_default="custom",
            ),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    preset_columns = {column["name"] for column in inspector.get_columns("rule_presets")}
    group_columns = {column["name"] for column in inspector.get_columns("rule_groups")}

    if "icon" in group_columns:
        op.drop_column("rule_groups", "icon")
    if "enabled" in preset_columns:
        op.drop_column("rule_presets", "enabled")
