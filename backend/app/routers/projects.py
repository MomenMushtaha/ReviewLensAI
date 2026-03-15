import json
import uuid
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.review import Review
from app.models.analysis import Analysis
from app.schemas.project import ProjectOut
from app.schemas.review import ReviewOut
from app.schemas.analysis import AnalysisOut, ThemeCluster, TrendPoint, PainPoint, Highlight, Recommendation

router = APIRouter()


@router.post("/projects", response_model=ProjectOut, status_code=201)
async def create_project(db: AsyncSession = Depends(get_db)):
    project = Project(id=str(uuid.uuid4()))
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


_SORT_COLUMNS = {
    "date": Review.date,
    "rating": Review.rating,
    "reviewer_name": Review.reviewer_name,
    "sentiment": Review.sentiment,
}


@router.get("/projects/{project_id}/reviews")
async def get_reviews(
    project_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sentiment: str | None = Query(None),
    rating_min: float | None = Query(None),
    rating_max: float | None = Query(None),
    sort_by: Literal["date", "rating", "reviewer_name", "sentiment"] = Query("date"),
    sort_dir: Literal["asc", "desc"] = Query("desc"),
    db: AsyncSession = Depends(get_db),
):
    # Base filter
    base = select(Review).where(Review.project_id == project_id)
    if sentiment:
        base = base.where(Review.sentiment == sentiment)
    if rating_min is not None:
        base = base.where(Review.rating >= rating_min)
    if rating_max is not None:
        base = base.where(Review.rating <= rating_max)

    # Total count
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Sorting
    col = _SORT_COLUMNS.get(sort_by, Review.date)
    order = col.asc().nullslast() if sort_dir == "asc" else col.desc().nullslast()

    # Paginated results
    stmt = base.order_by(order).offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    reviews = result.scalars().all()

    return {
        "reviews": [ReviewOut.model_validate(r) for r in reviews],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/projects/{project_id}/analysis", response_model=AnalysisOut)
async def get_analysis(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Analysis).where(Analysis.project_id == project_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found — run the pipeline first")

    themes_raw = json.loads(analysis.themes)
    themes = [ThemeCluster(**t) for t in themes_raw]

    # Apply theme labels from summarizer
    if analysis.theme_labels:
        label_map = json.loads(analysis.theme_labels)
        if label_map:
            for t in themes:
                # Try 0-indexed key first, then 1-indexed (LLMs sometimes use either)
                label = label_map.get(str(t.index)) or label_map.get(str(t.index + 1))
                if label:
                    t.label = label
            # If no labels matched (keys might be something else), try sequential assignment
            if all(t.label is None for t in themes):
                sorted_keys = sorted(label_map.keys(), key=lambda k: int(k) if k.isdigit() else 999)
                for i, key in enumerate(sorted_keys):
                    if i < len(themes):
                        themes[i].label = label_map[key]

    trend_raw = json.loads(analysis.trend_data)
    pain_raw = json.loads(analysis.pain_points) if analysis.pain_points else None
    highlights_raw = json.loads(analysis.highlights) if analysis.highlights else None
    recs_raw = json.loads(analysis.recommendations) if analysis.recommendations else None

    return AnalysisOut(
        project_id=project_id,
        sentiment_distribution=json.loads(analysis.sentiment_distribution),
        rating_distribution=json.loads(analysis.rating_distribution),
        themes=themes,
        trend_data=[TrendPoint(**t) for t in trend_raw],
        top_positive_reviews=json.loads(analysis.top_positive_reviews),
        top_negative_reviews=json.loads(analysis.top_negative_reviews),
        executive_summary=analysis.executive_summary,
        pain_points=[PainPoint(**p) for p in pain_raw] if pain_raw else None,
        highlights=[Highlight(**h) for h in highlights_raw] if highlights_raw else None,
        recommendations=[Recommendation(**r) for r in recs_raw] if recs_raw else None,
    )


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Project).where(Project.id == project_id))
    await db.commit()
