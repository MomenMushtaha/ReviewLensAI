"""add bias_analysis column to analyses

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("analyses", sa.Column("bias_analysis", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("analyses", "bias_analysis")
