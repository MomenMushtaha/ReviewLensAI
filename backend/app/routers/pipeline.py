import asyncio
import json
import logging
import re
import uuid
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import httpx
from bs4 import BeautifulSoup

from app.database import get_db, AsyncSessionLocal
from app.models.project import Project
from app.pipeline.orchestrator import run_pipeline, get_or_create_queue, pop_queue, cancel_pipeline
from app.pipeline.scraper import HEADERS

logger = logging.getLogger(__name__)
router = APIRouter()

_TRUSTPILOT_REVIEW_RE = re.compile(r"^/review/[a-zA-Z0-9._-]+/?$")


def _validate_trustpilot_url(url: str) -> str:
    """Validate that a URL points to a Trustpilot review page. Returns the normalized base URL."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid URL format")

    if not parsed.hostname or not parsed.hostname.endswith("trustpilot.com"):
        raise HTTPException(
            status_code=422,
            detail="Only Trustpilot URLs are supported. Please provide a URL like: https://www.trustpilot.com/review/example.com",
        )

    if not _TRUSTPILOT_REVIEW_RE.match(parsed.path):
        raise HTTPException(
            status_code=422,
            detail="This is not a Trustpilot review page. The URL must be in the format: https://www.trustpilot.com/review/company-name",
        )

    # Extract the slug (company name) for the error message
    slug = parsed.path.rstrip("/").split("/")[-1]
    base_url = f"https://www.trustpilot.com/review/{slug}"
    return base_url


async def _verify_company_exists(base_url: str) -> None:
    """Check that the company page actually exists on Trustpilot.

    Trustpilot often returns HTTP 200 even for non-existent companies,
    so we also parse the page body for business-unit data and review counts.
    """
    slug = base_url.rstrip("/").split("/")[-1]
    not_found_msg = (
        f'No company found on Trustpilot for "{slug}". '
        f"Please check the spelling and try again."
    )
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{base_url}?page=1",
                headers=HEADERS,
                timeout=15,
                follow_redirects=True,
            )
            # Retry once after a short delay if rate-limited on first attempt
            if resp.status_code in (403, 429):
                await asyncio.sleep(2)
                resp = await client.get(
                    f"{base_url}?page=1",
                    headers=HEADERS,
                    timeout=15,
                    follow_redirects=True,
                )
            if resp.status_code == 404:
                raise HTTPException(status_code=422, detail=not_found_msg)
            # 403/429 are rate-limiting — Trustpilot is blocking verification
            # but the company may still exist. Skip verification and let the
            # scraper (which has retries + backoff) handle it.
            if resp.status_code in (403, 429):
                logger.warning(
                    "Trustpilot returned %d during verification for %s — skipping check",
                    resp.status_code, slug,
                )
                return
            if resp.status_code >= 400:
                raise HTTPException(
                    status_code=422,
                    detail=f'Could not verify "{slug}" on Trustpilot (HTTP {resp.status_code}). Please check the URL and try again.',
                )

            # Trustpilot returns 200 for misspelled companies but the page
            # contains no businessUnit data or zero reviews. Parse to confirm.
            html = resp.text
            soup = BeautifulSoup(html, "lxml")
            next_data_tag = soup.find("script", id="__NEXT_DATA__")
            if next_data_tag:
                try:
                    data = json.loads(next_data_tag.string)
                except (json.JSONDecodeError, AttributeError):
                    # Can't parse → page structure is unexpected, likely not a valid company
                    raise HTTPException(status_code=422, detail=not_found_msg)

                page_props = data.get("props", {}).get("pageProps", {})

                # If Trustpilot returns a "not found" status inside the JSON
                tp_status = page_props.get("statusCode") or data.get("props", {}).get("statusCode")
                if tp_status in (404, "404"):
                    raise HTTPException(status_code=422, detail=not_found_msg)

                biz = page_props.get("businessUnit") or {}
                # No business unit at all → company doesn't exist
                if not biz:
                    raise HTTPException(status_code=422, detail=not_found_msg)

                # Business unit exists but has no reviews and no display name → likely a stub
                total_reviews = biz.get("numberOfReviews", 0)
                display_name = biz.get("displayName") or biz.get("identifyingName")
                if not display_name and total_reviews == 0:
                    raise HTTPException(status_code=422, detail=not_found_msg)
            else:
                # No __NEXT_DATA__ at all — page is likely an error/redirect page
                raise HTTPException(status_code=422, detail=not_found_msg)

    except HTTPException:
        raise
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Could not reach Trustpilot to verify the company. Please try again in a moment.",
        )


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
    base_url: str | None = None
    if source_type == "url" and url:
        base_url = _validate_trustpilot_url(url)
        await _verify_company_exists(base_url)
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
