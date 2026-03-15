import asyncio
import logging
import time
from datetime import datetime, timezone
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.pipeline import scraper as scraper_mod
from app.pipeline import ingester as ingester_mod
from app.pipeline import analyzer as analyzer_mod
from app.pipeline import summarizer as summarizer_mod

logger = logging.getLogger(__name__)


class CancelledError(Exception):
    def __init__(self, project_id: str):
        self.project_id = project_id
        super().__init__(f"Pipeline cancelled for {project_id}")


# project_id → asyncio.Queue for SSE events
_progress_queues: dict[str, asyncio.Queue] = {}
# project_id → asyncio.Event for cancellation
_cancel_events: dict[str, asyncio.Event] = {}


def get_or_create_queue(project_id: str) -> asyncio.Queue:
    if project_id not in _progress_queues:
        _progress_queues[project_id] = asyncio.Queue()
    return _progress_queues[project_id]


def pop_queue(project_id: str) -> asyncio.Queue | None:
    _cancel_events.pop(project_id, None)
    return _progress_queues.pop(project_id, None)


def cancel_pipeline(project_id: str) -> bool:
    ev = _cancel_events.get(project_id)
    if ev:
        ev.set()
        return True
    return False


async def _set_status(db: AsyncSession, project_id: str, status: str, error: str | None = None):
    values = {"status": status}
    if error:
        values["error_message"] = error
    if status == "ready":
        values["completed_at"] = datetime.now(timezone.utc)
    await db.execute(update(Project).where(Project.id == project_id).values(**values))
    await db.commit()
    logger.info("Status → %s: project=%s%s", status, project_id, f" error={error}" if error else "")


async def run_pipeline(
    project_id: str,
    source_type: str,
    url: str | None,
    csv_bytes: bytes | None,
    db: AsyncSession,
    max_reviews: int = 200,
):
    queue = get_or_create_queue(project_id)
    cancel_event = asyncio.Event()
    _cancel_events[project_id] = cancel_event
    pipeline_start = time.monotonic()

    async def emit(stage: str, progress: int, message: str):
        await queue.put({"type": "progress", "stage": stage, "progress": progress, "message": message})

    def check_cancelled():
        if cancel_event.is_set():
            raise CancelledError(project_id)

    product_name: str | None = None

    logger.info(
        "Pipeline run_pipeline() start: project=%s source=%s url=%s max_reviews=%d",
        project_id, source_type, url or "CSV", max_reviews,
    )

    try:
        # ── Stage 1: Scrape ──────────────────────────────────────────────────
        stage_start = time.monotonic()
        await _set_status(db, project_id, "scraping")
        await emit("scraping", 0, "Starting scrape…")

        if source_type == "url" and url:
            reviews, product_name = await scraper_mod.scrape_trustpilot(url, max_reviews=max_reviews, progress_cb=emit, cancel_check=check_cancelled)
        elif source_type == "csv" and csv_bytes:
            reviews = scraper_mod.parse_csv(csv_bytes)
            product_name = None
        else:
            raise ValueError("Must provide either a URL or CSV file")

        if not reviews:
            raise ValueError("No reviews were extracted from the source")

        logger.info(
            "Scraping done: project=%s reviews=%d product=%s elapsed=%.1fs",
            project_id, len(reviews), product_name or "N/A", time.monotonic() - stage_start,
        )

        check_cancelled()

        # Update product name if found
        if product_name:
            await db.execute(
                update(Project).where(Project.id == project_id).values(product_name=product_name)
            )
            await db.commit()

        # ── Stage 2: Ingest ──────────────────────────────────────────────────
        check_cancelled()
        stage_start = time.monotonic()
        await _set_status(db, project_id, "ingesting")
        ingest_result = await ingester_mod.ingest(reviews, project_id, db, progress_cb=emit)

        logger.info(
            "Ingestion done: project=%s inserted=%d duplicates=%d elapsed=%.1fs",
            project_id, ingest_result.inserted, ingest_result.skipped_duplicates,
            time.monotonic() - stage_start,
        )

        if ingest_result.inserted == 0 and ingest_result.skipped_duplicates > 0:
            await emit("ingesting", 100, "All reviews already ingested (duplicates skipped)")

        # ── Stage 3: Analyze ─────────────────────────────────────────────────
        check_cancelled()
        stage_start = time.monotonic()
        await _set_status(db, project_id, "analyzing")
        analysis_data = await analyzer_mod.analyze(project_id, db, progress_cb=emit)

        themes = analysis_data.get("themes", [])
        sentiment = analysis_data.get("sentiment_distribution", {})
        logger.info(
            "Analysis done: project=%s themes=%d sentiment=%s trends=%d elapsed=%.1fs",
            project_id, len(themes), sentiment,
            len(analysis_data.get("trend_data", [])),
            time.monotonic() - stage_start,
        )

        # ── Stage 4: Summarize ───────────────────────────────────────────────
        check_cancelled()
        stage_start = time.monotonic()
        await _set_status(db, project_id, "summarizing")
        await summarizer_mod.summarize(analysis_data, project_id, product_name, db, progress_cb=emit)

        logger.info(
            "Summarization done: project=%s elapsed=%.1fs",
            project_id, time.monotonic() - stage_start,
        )

        # ── Done ─────────────────────────────────────────────────────────────
        await _set_status(db, project_id, "ready")
        total_elapsed = time.monotonic() - pipeline_start
        logger.info(
            "Pipeline COMPLETE: project=%s reviews=%d total_elapsed=%.1fs",
            project_id, ingest_result.inserted, total_elapsed,
        )
        await queue.put({
            "type": "complete",
            "project_id": project_id,
            "review_count": ingest_result.inserted,
            "product_name": product_name,
        })

    except CancelledError:
        await _set_status(db, project_id, "error", "Analysis stopped by user")
        await queue.put({"type": "error", "message": "Analysis stopped by user"})
    except Exception as exc:
        total_elapsed = time.monotonic() - pipeline_start
        logger.exception(
            "Pipeline FAILED: project=%s error=%s elapsed=%.1fs",
            project_id, exc, total_elapsed,
        )
        error_msg = str(exc)
        await _set_status(db, project_id, "error", error_msg)
        await queue.put({"type": "error", "message": error_msg})
    finally:
        _cancel_events.pop(project_id, None)
