import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id", ondelete="CASCADE"), unique=True)
    sentiment_distribution: Mapped[str] = mapped_column(String)   # JSON
    rating_distribution: Mapped[str] = mapped_column(String)       # JSON
    themes: Mapped[str] = mapped_column(String)                    # JSON list[ThemeCluster]
    trend_data: Mapped[str] = mapped_column(String)                # JSON
    top_positive_reviews: Mapped[str] = mapped_column(String)      # JSON list[str]
    top_negative_reviews: Mapped[str] = mapped_column(String)      # JSON list[str]
    # Populated by Summarizer
    executive_summary: Mapped[str | None] = mapped_column(String, nullable=True)
    pain_points: Mapped[str | None] = mapped_column(String, nullable=True)       # JSON
    highlights: Mapped[str | None] = mapped_column(String, nullable=True)        # JSON
    recommendations: Mapped[str | None] = mapped_column(String, nullable=True)   # JSON
    theme_labels: Mapped[str | None] = mapped_column(String, nullable=True)      # JSON dict
    bias_analysis: Mapped[str | None] = mapped_column(String, nullable=True)     # JSON BiasAnalysis
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
