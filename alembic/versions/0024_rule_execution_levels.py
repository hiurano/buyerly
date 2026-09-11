"""Let a rule act on a campaign, and record which entity an action targeted.

Revision ID: 0024_rule_execution_levels
Revises: 0023_rule_enabled_icon
Create Date: 2026-09-12 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0024_rule_execution_levels"
down_revision: Union[str, None] = "0023_rule_enabled_icon"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Every pre-existing rule and recorded action targeted an ad set, so that is the
# backfill value and the server default.
_NEW_COLUMNS = {
    "rule_presets": [
        ("level", sa.String(length=16), "adset"),
    ],
    "audit_events": [
        ("entity_level", sa.String(length=16), "adset"),
        ("entity_id", sa.String(length=64), ""),
        ("entity_name", sa.String(), ""),
    ],
    "rule_execution_states": [
        ("entity_level", sa.String(length=16), "adset"),
        ("entity_id", sa.String(length=64), ""),
    ],
}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table_name, columns in _NEW_COLUMNS.items():
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name, column_type, default in columns:
            if column_name in existing:
                continue
            op.add_column(
                table_name,
                sa.Column(
                    column_name,
                    column_type,
                    nullable=False,
                    server_default=default,
                ),
            )

    # Existing audit rows already name their ad set; carry it into the new
    # columns so the trail reads consistently across the migration boundary.
    op.execute(
        "UPDATE audit_events SET entity_id = adset_id, entity_name = adset_name "
        "WHERE entity_id = '' AND adset_id <> ''"
    )
    op.execute(
        "UPDATE rule_execution_states SET entity_id = adset_id "
        "WHERE entity_id = '' AND adset_id <> ''"
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table_name, columns in _NEW_COLUMNS.items():
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name, _, _ in reversed(columns):
            if column_name in existing:
                op.drop_column(table_name, column_name)
