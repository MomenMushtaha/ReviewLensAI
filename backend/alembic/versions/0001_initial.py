"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "projects",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("source_url", sa.String, nullable=True),
        sa.Column("platform", sa.String, nullable=False, server_default="trustpilot"),
        sa.Column("product_name", sa.String, nullable=True),
        sa.Column("status", sa.String, nullable=False, server_default="pending"),
        sa.Column("error_message", sa.String, nullable=True),
        sa.Column("review_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "reviews",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("project_id", sa.String, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String, nullable=False),
        sa.Column("external_id", sa.String, nullable=True),
        sa.Column("reviewer_name", sa.String, nullable=True),
        sa.Column("rating", sa.Float, nullable=True),
        sa.Column("title", sa.String, nullable=True),
        sa.Column("body", sa.String, nullable=False),
        sa.Column("body_hash", sa.String, nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("helpful_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("verified", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("sentiment", sa.String, nullable=True),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_reviews_project_id", "reviews", ["project_id"])
    op.create_index("ix_reviews_body_hash", "reviews", ["body_hash"], unique=True)

    op.create_table(
        "analyses",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("project_id", sa.String, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sentiment_distribution", sa.String, nullable=False),
        sa.Column("rating_distribution", sa.String, nullable=False),
        sa.Column("themes", sa.String, nullable=False),
        sa.Column("trend_data", sa.String, nullable=False),
        sa.Column("top_positive_reviews", sa.String, nullable=False),
        sa.Column("top_negative_reviews", sa.String, nullable=False),
        sa.Column("executive_summary", sa.String, nullable=True),
        sa.Column("pain_points", sa.String, nullable=True),
        sa.Column("highlights", sa.String, nullable=True),
        sa.Column("recommendations", sa.String, nullable=True),
        sa.Column("theme_labels", sa.String, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_analyses_project_id", "analyses", ["project_id"], unique=True)


def downgrade() -> None:
    op.drop_table("analyses")
    op.drop_table("reviews")
    op.drop_table("projects")
