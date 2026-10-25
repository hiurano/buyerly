"""The change log wakes WebSocket hubs: sync_log_assign_id sends NOTIFY at commit (#506).

Revision ID: 0052_sync_notify
Revises: 0051_sync_actions
Create Date: 2026-10-25 12:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

from database.sync_log import install_statements


revision: str = "0052_sync_notify"
down_revision: Union[str, None] = "0051_sync_actions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Plain driver SQL: text() would read "':members'" in the function bodies as a bind parameter.
    bind = op.get_bind()
    for statement in install_statements():
        bind.exec_driver_sql(statement)


def downgrade() -> None:
    # Hubs also poll, so the 0051 function without NOTIFY only delays delivery.
    op.get_bind().exec_driver_sql(
        """
        CREATE OR REPLACE FUNCTION sync_log_assign_id() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            PERFORM pg_advisory_xact_lock(504000504);
            UPDATE sync_actions SET sync_id = nextval('sync_actions_sync_id_seq') WHERE id = NEW.id;
            RETURN NULL;
        END
        $$
        """
    )
