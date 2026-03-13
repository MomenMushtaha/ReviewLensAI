from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI

from app.config import settings
from app.database import get_embedder
from app.models.project import Project
from app.agents.guardrails import pre_filter, post_validate, SAFE_FALLBACK
from app.agents.prompts import AGENT_SYSTEM_PROMPT

_client = AsyncOpenAI(api_key=settings.openai_api_key)


async def _retrieve_chunks(question: str, project_id: str, db: AsyncSession) -> list[dict]:
    embedder = get_embedder()
    if not embedder:
        return []

    q_emb = embedder.encode([question])[0].tolist()
    q_emb_str = "[" + ",".join(str(x) for x in q_emb) + "]"

    result = await db.execute(
        text("""
            SELECT id, body, reviewer_name, rating, date,
                   1 - (embedding <=> :qemb::vector) AS similarity
            FROM reviews
            WHERE project_id = :pid
              AND embedding IS NOT NULL
              AND 1 - (embedding <=> :qemb::vector) >= :threshold
            ORDER BY embedding <=> :qemb::vector
            LIMIT 8
        """),
        {"qemb": q_emb_str, "pid": project_id, "threshold": settings.similarity_threshold},
    )
    rows = result.fetchall()
    return [
        {
            "review_id": row.id,
            "body": row.body,
            "reviewer_name": row.reviewer_name,
            "rating": row.rating,
            "date": str(row.date.date()) if row.date else None,
            "similarity": round(float(row.similarity), 3),
        }
        for row in rows
    ]


def _format_chunks(chunks: list[dict]) -> str:
    lines = []
    for i, c in enumerate(chunks, 1):
        rating_str = f"★{c['rating']:.0f}" if c.get("rating") else ""
        date_str = c.get("date") or ""
        name_str = c.get("reviewer_name") or "Anonymous"
        lines.append(f"[{i}] {name_str} {rating_str} {date_str}\n{c['body']}")
    return "\n\n".join(lines)


def _get_date_range(chunks: list[dict]) -> str:
    dates = [c["date"] for c in chunks if c.get("date")]
    if not dates:
        return "unknown"
    return f"{min(dates)} – {max(dates)}"


async def answer(
    question: str,
    project: Project,
    history: list[dict],
    db: AsyncSession,
) -> dict:
    # ── Layer 1: Retrieve first to check relevance ───────────────────────────
    chunks = await _retrieve_chunks(question, project.id, db)
    has_chunks = len(chunks) > 0

    guard = pre_filter(question, has_chunks)
    if not guard.allowed:
        return {
            "response": SAFE_FALLBACK,
            "sources": [],
            "guardrail_triggered": True,
            "guardrail_category": guard.category,
        }

    # ── Layer 2: Build system prompt + call OpenAI ───────────────────────────
    system_prompt = AGENT_SYSTEM_PROMPT.format(
        product_name=project.product_name or "Unknown",
        review_count=project.review_count,
        platform=project.platform,
        date_range=_get_date_range(chunks),
        retrieved_chunks=_format_chunks(chunks),
    )

    messages = [{"role": "system", "content": system_prompt}]
    messages += history
    messages.append({"role": "user", "content": question})

    response = await _client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=800,
        messages=messages,
    )
    reply = response.choices[0].message.content or SAFE_FALLBACK

    # ── Layer 3: Post-validate ───────────────────────────────────────────────
    chunk_bodies = [c["body"] for c in chunks]
    post_guard = post_validate(reply, chunk_bodies)
    if not post_guard.allowed:
        return {
            "response": SAFE_FALLBACK,
            "sources": [],
            "guardrail_triggered": True,
            "guardrail_category": post_guard.category,
        }

    sources = [
        {
            "review_id": c["review_id"],
            "excerpt": c["body"][:200],
            "rating": c["rating"],
            "reviewer_name": c["reviewer_name"],
        }
        for c in chunks[:3]
    ]

    return {
        "response": reply,
        "sources": sources,
        "guardrail_triggered": False,
        "guardrail_category": None,
    }
