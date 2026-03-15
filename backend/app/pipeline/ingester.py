import hashlib
import logging
import time
import uuid
from dataclasses import dataclass

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.database import get_embedder
from app.models.review import Review
from app.models.project import Project
from app.schemas.review import RawReview
from app.utils.text_cleaner import clean_text

logger = logging.getLogger(__name__)

EMBEDDING_BATCH = 64


@dataclass
class IngestionResult:
    total: int
    inserted: int
    skipped_duplicates: int


def _body_hash(source_url: str, body: str) -> str:
    key = f"{source_url}:{body[:200]}"
    return hashlib.sha256(key.encode()).hexdigest()


async def ingest(
    reviews: list[RawReview],
    project_id: str,
    db: AsyncSession,
    progress_cb=None,
) -> IngestionResult:
    logger.info("Ingest start: project=%s raw_reviews=%d", project_id, len(reviews))

    if not reviews:
        logger.warning("Ingest skipped: no reviews provided project=%s", project_id)
        return IngestionResult(total=0, inserted=0, skipped_duplicates=0)

    if progress_cb:
        await progress_cb("ingesting", 10, f"Normalizing {len(reviews)} reviews…")

    # 1. Normalize and deduplicate within the batch
    seen_hashes: set[str] = set()
    rows: list[dict] = []
    empty_body_count = 0
    batch_dup_count = 0
    for r in reviews:
        body = clean_text(r.body)
        if not body:
            empty_body_count += 1
            continue
        h = _body_hash(r.source_url, body)
        if h in seen_hashes:
            batch_dup_count += 1
            continue
        seen_hashes.add(h)
        rows.append({
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "platform": r.platform,
            "external_id": r.external_id,
            "reviewer_name": r.reviewer_name,
            "rating": r.rating,
            "title": r.title,
            "body": body,
            "body_hash": h,
            "date": r.date,
            "helpful_count": r.helpful_count,
            "verified": r.verified,
        })

    logger.info(
        "Dedup results: project=%s unique=%d batch_dups=%d empty_bodies=%d",
        project_id, len(rows), batch_dup_count, empty_body_count,
    )

    if not rows:
        logger.warning("Ingest: all reviews filtered out project=%s", project_id)
        return IngestionResult(total=len(reviews), inserted=0, skipped_duplicates=len(reviews))

    if progress_cb:
        await progress_cb("ingesting", 30, f"Storing {len(rows)} reviews in Supabase…")

    # 2. Upsert — skip duplicates within the same project via composite constraint
    stmt = insert(Review).values(rows).on_conflict_do_nothing(
        constraint="uq_review_project_body"
    )
    await db.execute(stmt)
    await db.commit()

    # 3. Count how many were actually inserted by fetching their IDs
    result = await db.execute(
        select(Review.id, Review.body).where(
            Review.project_id == project_id,
            Review.embedding.is_(None),
        )
    )
    unembedded = result.all()
    inserted_count = len(unembedded)
    skipped = len(rows) - inserted_count

    if progress_cb:
        await progress_cb("ingesting", 50, f"Generating embeddings for {inserted_count} reviews…")

    # 4. Generate and store embeddings in batches (async OpenAI API)
    embedder = get_embedder()
    if embedder and unembedded:
        ids = [row.id for row in unembedded]
        bodies = [row.body for row in unembedded]
        embed_start = time.monotonic()
        total_batches = (len(bodies) + EMBEDDING_BATCH - 1) // EMBEDDING_BATCH
        logger.info(
            "Embedding start: project=%s reviews=%d batches=%d batch_size=%d",
            project_id, len(bodies), total_batches, EMBEDDING_BATCH,
        )

        for i in range(0, len(bodies), EMBEDDING_BATCH):
            batch_num = i // EMBEDDING_BATCH + 1
            batch_ids = ids[i: i + EMBEDDING_BATCH]
            batch_bodies = bodies[i: i + EMBEDDING_BATCH]
            embeddings = await embedder.encode(batch_bodies)

            for rid, emb in zip(batch_ids, embeddings):
                await db.execute(
                    update(Review)
                    .where(Review.id == rid)
                    .values(embedding=emb)
                )

            pct = 50 + int((i + len(batch_ids)) / len(bodies) * 40)
            if progress_cb:
                await progress_cb("ingesting", pct, f"Embedded {min(i + EMBEDDING_BATCH, len(bodies))}/{len(bodies)}…")
            logger.debug("Embedding batch %d/%d done: project=%s", batch_num, total_batches, project_id)

        await db.commit()
        logger.info(
            "Embedding complete: project=%s reviews=%d elapsed=%.1fs",
            project_id, len(bodies), time.monotonic() - embed_start,
        )
    elif not embedder:
        logger.warning("No embedder available — skipping embeddings: project=%s", project_id)

    # 5. Update project review_count
    total_result = await db.execute(
        select(Review).where(Review.project_id == project_id)
    )
    total_in_db = len(total_result.all())
    await db.execute(
        update(Project)
        .where(Project.id == project_id)
        .values(review_count=total_in_db)
    )
    await db.commit()

    if progress_cb:
        await progress_cb("ingesting", 100, f"Ingested {inserted_count} reviews ({skipped} duplicates skipped)")

    logger.info(
        "Ingest complete: project=%s total=%d inserted=%d db_dups=%d total_in_db=%d",
        project_id, len(reviews), inserted_count, skipped, total_in_db,
    )

    return IngestionResult(
        total=len(reviews),
        inserted=inserted_count,
        skipped_duplicates=len(reviews) - inserted_count,
    )
