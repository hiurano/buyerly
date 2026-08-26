"""Add access_token_encrypted column to accounts and encrypt legacy tokens

Revision ID: 0003_encrypt_manual_meta_tokens
Revises: 0002_adset_inventory_cache
Create Date: 2026-08-26 18:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0003_encrypt_manual_meta_tokens"
down_revision: Union[str, None] = "0002_adset_inventory_cache"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "access_token_encrypted",
            sa.Text(),
            nullable=True,
            server_default="",
        ),
    )


def downgrade() -> None:
    op.drop_column("accounts", "access_token_encrypted")
