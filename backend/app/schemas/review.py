from pydantic import BaseModel
from datetime import datetime


class RawReview(BaseModel):
    source_url: str
    platform: str = "trustpilot"
    external_id: str | None = None
    reviewer_name: str | None = None
    rating: float | None = None
    title: str | None = None
    body: str
    date: datetime | None = None
    helpful_count: int = 0
    verified: bool = False


class ReviewOut(BaseModel):
    id: str
    project_id: str
    platform: str
    reviewer_name: str | None
    rating: float | None
    title: str | None
    body: str
    date: datetime | None
    helpful_count: int
    verified: bool
    sentiment: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
