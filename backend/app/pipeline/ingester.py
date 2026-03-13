import hashlib
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
    if not reviews:
        return IngestionResult(total=0, inserted=0, skipped_duplicates=0)

    if progress_cb:
        await progress_cb("ingesting", 10, f"Normalizing {len(reviews)} reviews…")

    # 1. Normalize and deduplicate within the batch
    seen_hashes: set[str] = set()
    rows: list[dict] = []
    for r in reviews:
        body = clean_text(r.body)
        if not body:
            continue
        h = _body_hash(r.source_url, body)
        if h in seen_hashes:
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

    if not rows:
        return IngestionResult(total=len(reviews), inserted=0, skipped_duplicates=len(reviews))

    if progress_cb:
        await progress_cb("ingesting", 30, f"Storing {len(rows)} reviews in Supabase…")

    # 2. Upsert — skip duplicates via ON CONFLICT DO NOTHING
    stmt = insert(Review).values(rows).on_conflict_do_nothing(index_elements=["body_hash"])
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

    # 4. Generate and store embeddings in batches
    embedder = get_embedder()
    if embedder and unembedded:
        ids = [row.id for row in unembedded]
        bodies = [row.body for row in unembedded]

        for i in range(0, len(bodies), EMBEDDING_BATCH):
            batch_ids = ids[i: i + EMBEDDING_BATCH]
            batch_bodies = bodies[i: i + EMBEDDING_BATCH]
            embeddings = embedder.encode(batch_bodies, show_progress_bar=False).tolist()

            for rid, emb in zip(batch_ids, embeddings):
                await db.execute(
                    update(Review)
                    .where(Review.id == rid)
                    .values(embedding=emb)
                )

            pct = 50 + int((i + len(batch_ids)) / len(bodies) * 40)
            if progress_cb:
                await progress_cb("ingesting", pct, f"Embedded {min(i + EMBEDDING_BATCH, len(bodies))}/{len(bodies)}…")

        await db.commit()

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

    return IngestionResult(
        total=len(reviews),
        inserted=inserted_count,
        skipped_duplicates=len(reviews) - inserted_count,
    )
