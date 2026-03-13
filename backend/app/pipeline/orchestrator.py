import asyncio
from datetime import datetime, timezone
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.pipeline import scraper as scraper_mod
from app.pipeline import ingester as ingester_mod
from app.pipeline import analyzer as analyzer_mod
from app.pipeline import summarizer as summarizer_mod

# project_id → asyncio.Queue for SSE events
_progress_queues: dict[str, asyncio.Queue] = {}


def get_or_create_queue(project_id: str) -> asyncio.Queue:
    if project_id not in _progress_queues:
        _progress_queues[project_id] = asyncio.Queue()
    return _progress_queues[project_id]


def pop_queue(project_id: str) -> asyncio.Queue | None:
    return _progress_queues.pop(project_id, None)


async def _set_status(db: AsyncSession, project_id: str, status: str, error: str | None = None):
    values = {"status": status}
    if error:
        values["error_message"] = error
    if status == "ready":
        values["completed_at"] = datetime.now(timezone.utc)
    await db.execute(update(Project).where(Project.id == project_id).values(**values))
    await db.commit()


async def run_pipeline(
    project_id: str,
    source_type: str,
    url: str | None,
    csv_bytes: bytes | None,
    db: AsyncSession,
):
    queue = get_or_create_queue(project_id)

    async def emit(stage: str, progress: int, message: str):
        await queue.put({"type": "progress", "stage": stage, "progress": progress, "message": message})

    product_name: str | None = None

    try:
        # ── Stage 1: Scrape ──────────────────────────────────────────────────
        await _set_status(db, project_id, "scraping")
        await emit("scraping", 0, "Starting scrape…")

        if source_type == "url" and url:
            reviews, product_name = await scraper_mod.scrape_trustpilot(url, progress_cb=emit)
        elif source_type == "csv" and csv_bytes:
            reviews = scraper_mod.parse_csv(csv_bytes)
            product_name = None
        else:
            raise ValueError("Must provide either a URL or CSV file")

        if not reviews:
            raise ValueError("No reviews were extracted from the source")

        # Update product name if found
        if product_name:
            await db.execute(
                update(Project).where(Project.id == project_id).values(product_name=product_name)
            )
            await db.commit()

        # ── Stage 2: Ingest ──────────────────────────────────────────────────
        await _set_status(db, project_id, "ingesting")
        ingest_result = await ingester_mod.ingest(reviews, project_id, db, progress_cb=emit)

        if ingest_result.inserted == 0 and ingest_result.skipped_duplicates > 0:
            await emit("ingesting", 100, "All reviews already ingested (duplicates skipped)")

        # ── Stage 3: Analyze ─────────────────────────────────────────────────
        await _set_status(db, project_id, "analyzing")
        analysis_data = await analyzer_mod.analyze(project_id, db, progress_cb=emit)

        # ── Stage 4: Summarize ───────────────────────────────────────────────
        await _set_status(db, project_id, "summarizing")
        await summarizer_mod.summarize(analysis_data, project_id, product_name, db, progress_cb=emit)

        # ── Done ─────────────────────────────────────────────────────────────
        await _set_status(db, project_id, "ready")
        await queue.put({
            "type": "complete",
            "project_id": project_id,
            "review_count": ingest_result.inserted,
        })

    except Exception as exc:
        error_msg = str(exc)
        await _set_status(db, project_id, "error", error_msg)
        await queue.put({"type": "error", "message": error_msg})
