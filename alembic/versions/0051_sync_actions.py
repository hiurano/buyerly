"""The sync engine's change log: sync_actions and the triggers that fill it (#504).

Revision ID: 0051_sync_actions
Revises: 0050_account_notifications
Create Date: 2026-10-24 18:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from database.sync_log import install_statements, uninstall_statements


revision: str = "0051_sync_actions"
down_revision: Union[str, None] = "0050_account_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if "sync_actions" not in set(sa.inspect(bind).get_table_names()):
        op.create_table(
            "sync_actions",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("sync_id", sa.BigInteger(), nullable=True, unique=True),
            sa.Column("model", sa.String(64), nullable=False),
            sa.Column("model_id", sa.String(64), nullable=False),
            sa.Column("action", sa.String(16), nullable=False),
            sa.Column("data", postgresql.JSONB(), nullable=False),
            sa.Column("sync_groups", postgresql.ARRAY(sa.Text()), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_sync_actions_sync_groups", "sync_actions", ["sync_groups"], postgresql_using="gin")
        op.create_index("ix_sync_actions_created_at", "sync_actions", ["created_at"])
    # Plain driver SQL: text() would read "':members'" in the function bodies as a bind parameter.
    for statement in install_statements():
        bind.exec_driver_sql(statement)


def downgrade() -> None:
    bind = op.get_bind()
    for statement in uninstall_statements():
        bind.exec_driver_sql(statement)
    op.drop_index("ix_sync_actions_created_at", table_name="sync_actions")
    op.drop_index("ix_sync_actions_sync_groups", table_name="sync_actions")
    op.drop_table("sync_actions")
    bind.exec_driver_sql("DROP SEQUENCE IF EXISTS sync_actions_sync_id_seq")
