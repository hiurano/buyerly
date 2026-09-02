"""Add one-time login links and invitation context to OTP records.

Revision ID: 0022_login_magic_links
Revises: 0021_analytics_entity_facts
Create Date: 2026-09-02 14:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0022_login_magic_links"
down_revision: Union[str, None] = "0021_analytics_entity_facts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"] for column in inspector.get_columns("email_verification_codes")
    }
    indexes = {
        index["name"] for index in inspector.get_indexes("email_verification_codes")
    }

    if "link_token_hash" not in columns:
        op.add_column(
            "email_verification_codes",
            sa.Column("link_token_hash", sa.String(length=64), nullable=True),
        )
    if "invite_id" not in columns:
        op.add_column(
            "email_verification_codes",
            sa.Column(
                "invite_id",
                sa.Integer(),
                sa.ForeignKey(
                    "workspace_invites.id",
                    name="fk_email_verification_codes_invite",
                    ondelete="SET NULL",
                ),
                nullable=True,
            ),
        )

    if "ix_email_verification_codes_link_token_hash" not in indexes:
        op.create_index(
            "ix_email_verification_codes_link_token_hash",
            "email_verification_codes",
            ["link_token_hash"],
            unique=True,
        )
    if "ix_email_verification_codes_invite_id" not in indexes:
        op.create_index(
            "ix_email_verification_codes_invite_id",
            "email_verification_codes",
            ["invite_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"] for column in inspector.get_columns("email_verification_codes")
    }
    indexes = {
        index["name"] for index in inspector.get_indexes("email_verification_codes")
    }

    if "ix_email_verification_codes_invite_id" in indexes:
        op.drop_index(
            "ix_email_verification_codes_invite_id",
            table_name="email_verification_codes",
        )
    if "ix_email_verification_codes_link_token_hash" in indexes:
        op.drop_index(
            "ix_email_verification_codes_link_token_hash",
            table_name="email_verification_codes",
        )
    if "invite_id" in columns:
        op.drop_column("email_verification_codes", "invite_id")
    if "link_token_hash" in columns:
        op.drop_column("email_verification_codes", "link_token_hash")
