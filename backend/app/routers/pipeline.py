import asyncio
import json
import uuid
from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models.project import Project
from app.pipeline.orchestrator import run_pipeline, get_or_create_queue, pop_queue

router = APIRouter()


@router.post("/pipeline/run", status_code=202)
async def start_pipeline(
    source_type: str = Form(...),
    url: str | None = Form(None),
    file: UploadFile | None = File(None),
    product_name: str | None = Form(None),
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

    # Run pipeline in background task
    asyncio.create_task(
        _run_pipeline_bg(project.id, source_type, url, csv_bytes)
    )

    return {"project_id": project.id}


async def _run_pipeline_bg(project_id: str, source_type: str, url: str | None, csv_bytes: bytes | None):
    async with AsyncSessionLocal() as db:
        await run_pipeline(project_id, source_type, url, csv_bytes, db)


@router.get("/pipeline/stream/{project_id}")
async def stream_progress(project_id: str):
    queue = get_or_create_queue(project_id)

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
                    break
        finally:
            pop_queue(project_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
