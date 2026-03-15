import asyncio
import json
import logging
import uuid
from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models.project import Project
from app.pipeline.orchestrator import run_pipeline, get_or_create_queue, pop_queue, cancel_pipeline

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/pipeline/run", status_code=202)
async def start_pipeline(
    source_type: str = Form(...),
    url: str | None = Form(None),
    file: UploadFile | None = File(None),
    product_name: str | None = Form(None),
    max_reviews: int = Form(200),
    db: AsyncSession = Depends(get_db),
):
    if source_type == "url" and not url:
        raise HTTPException(status_code=422, detail="URL required when source_type=url")
    if source_type == "csv" and not file:
        raise HTTPException(status_code=422, detail="File required when source_type=csv")

    project = Project(
        id=str(uuid.uuid4()),
        source_url=url,
        platform="trustpilot" if source_type == "url" else "csv",
        product_name=product_name,
        status="pending",
    )
    db.add(project)
    await db.commit()

    csv_bytes = await file.read() if file else None
    file_size = len(csv_bytes) if csv_bytes else 0

    logger.info(
        "Pipeline started: project=%s source=%s url=%s csv_size=%d max_reviews=%d",
        project.id, source_type, url or "N/A", file_size, max_reviews,
    )

    # Run pipeline in background task
    asyncio.create_task(
        _run_pipeline_bg(project.id, source_type, url, csv_bytes, max_reviews)
    )

    return {"project_id": project.id}


async def _run_pipeline_bg(project_id: str, source_type: str, url: str | None, csv_bytes: bytes | None, max_reviews: int = 200):
    logger.info("Background task started: project=%s max_reviews=%d", project_id, max_reviews)
    try:
        async with AsyncSessionLocal() as db:
            await run_pipeline(project_id, source_type, url, csv_bytes, db, max_reviews=max_reviews)
        logger.info("Background task completed: project=%s", project_id)
    except Exception:
        logger.exception("Background task FAILED: project=%s", project_id)


@router.post("/pipeline/cancel/{project_id}")
async def cancel(project_id: str):
    if cancel_pipeline(project_id):
        return {"status": "cancelled"}
    raise HTTPException(status_code=404, detail="No active pipeline for this project")


@router.get("/pipeline/stream/{project_id}")
async def stream_progress(project_id: str):
    queue = get_or_create_queue(project_id)
    logger.info("SSE stream connected: project=%s", project_id)

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    yield "event: ping\ndata: {}\n\n"
                    continue

                event_type = event.get("type", "progress")
                data = json.dumps(event)
                yield f"event: {event_type}\ndata: {data}\n\n"

                if event_type in ("complete", "error"):
                    logger.info("SSE stream ending: project=%s event=%s", project_id, event_type)
                    break
        finally:
            pop_queue(project_id)
            logger.info("SSE stream closed: project=%s", project_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
