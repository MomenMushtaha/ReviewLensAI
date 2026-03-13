from pydantic import BaseModel
from datetime import datetime


class ProjectCreate(BaseModel):
    source_url: str | None = None
    platform: str = "trustpilot"
    product_name: str | None = None


class ProjectOut(BaseModel):
    id: str
    source_url: str | None
    platform: str
    product_name: str | None
    status: str
    error_message: str | None
    review_count: int
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
