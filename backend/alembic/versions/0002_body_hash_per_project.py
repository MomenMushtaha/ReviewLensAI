"""make body_hash unique per project instead of globally

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-15
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old global unique index on body_hash
    op.drop_index("ix_reviews_body_hash", table_name="reviews")

    # Create a non-unique index on body_hash (for lookup performance)
    op.create_index("ix_reviews_body_hash", "reviews", ["body_hash"], unique=False)

    # Create composite unique constraint: same review body is only
    # deduplicated within the same project, not across projects
    op.create_unique_constraint(
        "uq_review_project_body", "reviews", ["project_id", "body_hash"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_review_project_body", "reviews", type_="unique")
    op.drop_index("ix_reviews_body_hash", table_name="reviews")
    op.create_index("ix_reviews_body_hash", "reviews", ["body_hash"], unique=True)
