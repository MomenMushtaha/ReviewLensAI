import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete
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


@router.get("/projects/{project_id}/reviews", response_model=list[ReviewOut])
async def get_reviews(
    project_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sentiment: str | None = Query(None),
    rating_min: float | None = Query(None),
    rating_max: float | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Review).where(Review.project_id == project_id)
    if sentiment:
        stmt = stmt.where(Review.sentiment == sentiment)
    if rating_min is not None:
        stmt = stmt.where(Review.rating >= rating_min)
    if rating_max is not None:
        stmt = stmt.where(Review.rating <= rating_max)
    stmt = stmt.order_by(Review.date.desc().nullslast()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/projects/{project_id}/analysis", response_model=AnalysisOut)
async def get_analysis(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Analysis).where(Analysis.project_id == project_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found — run the pipeline first")

    themes_raw = json.loads(analysis.themes)
    themes = [ThemeCluster(**t) for t in themes_raw]

    # Apply theme labels if available
    if analysis.theme_labels:
        label_map = json.loads(analysis.theme_labels)
        for t in themes:
            t.label = label_map.get(str(t.index), t.label)

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
