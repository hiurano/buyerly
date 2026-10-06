"""Where each rule stands on each entity as of its latest check (#322).

Revision ID: 0033_rule_entity_states
Revises: 0032_telegram_notifications
Create Date: 2026-10-06 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0033_rule_entity_states"
down_revision: Union[str, None] = "0032_telegram_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "rule_entity_states" in inspector.get_table_names():
        return

    op.create_table(
        "rule_entity_states",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "workspace_id",
            sa.Integer(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("account_id", sa.String(), nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("entity_level", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("entity_name", sa.String(), nullable=False, server_default=""),
        sa.Column("campaign_id", sa.String(), nullable=False, server_default=""),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False, server_default=""),
        sa.Column("wait_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("yielded_to_rule_id", sa.Integer(), nullable=True),
        sa.Column("yielded_to_rule_name", sa.String(), nullable=False, server_default=""),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "workspace_id",
            "account_id",
            "rule_id",
            "entity_level",
            "entity_id",
            name="uq_rule_entity_state",
        ),
    )
    op.create_index("ix_rule_entity_states_workspace_id", "rule_entity_states", ["workspace_id"])
    op.create_index("ix_rule_entity_states_account_id", "rule_entity_states", ["account_id"])
    op.create_index("ix_rule_entity_states_rule_id", "rule_entity_states", ["rule_id"])
    op.create_index("ix_rule_entity_states_entity_id", "rule_entity_states", ["entity_id"])


def downgrade() -> None:
    if "rule_entity_states" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("rule_entity_states")
