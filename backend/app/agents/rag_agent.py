import json
import re

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI

from app.config import settings
from app.database import get_embedder
from app.models.project import Project
from app.models.analysis import Analysis
from app.agents.guardrails import pre_filter, post_validate, SAFE_FALLBACK, context_aware_fallback
from app.agents.prompts import AGENT_SYSTEM_PROMPT

_client = AsyncOpenAI(api_key=settings.openai_api_key)

_FOLLOWUP_RE = re.compile(r"^>>FOLLOWUP:\s*(.+)$", re.MULTILINE)


async def _retrieve_chunks(question: str, project_id: str, db: AsyncSession) -> list[dict]:
    embedder = get_embedder()
    if not embedder:
        return []

    embeddings = await embedder.encode([question])
    q_emb = embeddings[0]
    q_emb_str = "[" + ",".join(str(x) for x in q_emb) + "]"

    result = await db.execute(
        text("""
            SELECT id, body, reviewer_name, rating, date, title, sentiment,
                   1 - (embedding <=> CAST(:qemb AS vector)) AS similarity
            FROM reviews
            WHERE project_id = :pid
              AND embedding IS NOT NULL
              AND 1 - (embedding <=> CAST(:qemb AS vector)) >= :threshold
            ORDER BY embedding <=> CAST(:qemb AS vector)
            LIMIT 15
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
            "title": getattr(row, "title", None),
            "sentiment": getattr(row, "sentiment", None),
            "similarity": round(float(row.similarity), 3),
        }
        for row in rows
    ]


def _format_chunks(chunks: list[dict]) -> str:
    if not chunks:
        return "(No matching reviews found)"
    lines = []
    for i, c in enumerate(chunks, 1):
        rating_val = c.get("rating")
        rating_str = f"★{rating_val:.0f}/5" if rating_val else "no rating"
        date_str = c.get("date") or "undated"
        name_str = c.get("reviewer_name") or "Anonymous"
        sentiment_str = c.get("sentiment") or "unknown"
        similarity_pct = f"{c['similarity']:.0%}" if c.get("similarity") else "?"

        # Flag rating/sentiment mismatches for the analyst to notice
        mismatch_flag = ""
        if rating_val and sentiment_str != "unknown":
            if rating_val >= 4 and sentiment_str == "negative":
                mismatch_flag = " ⚠️ RATING-SENTIMENT MISMATCH: high rating but negative tone"
            elif rating_val <= 2 and sentiment_str == "positive":
                mismatch_flag = " ⚠️ RATING-SENTIMENT MISMATCH: low rating but positive tone"

        header = (
            f"[Review {i}] {name_str} | {rating_str} | {date_str} | "
            f"sentiment: {sentiment_str} | relevance: {similarity_pct}{mismatch_flag}"
        )
        title_str = f'Title: "{c["title"]}"\n' if c.get("title") else ""
        body = c["body"]
        lines.append(f"{header}\n{title_str}{body}")
    return "\n\n---\n\n".join(lines)


def _get_date_range(chunks: list[dict]) -> str:
    dates = [c["date"] for c in chunks if c.get("date")]
    if not dates:
        return "unknown"
    return f"{min(dates)} – {max(dates)}"


async def _get_analysis_context(project_id: str, db: AsyncSession) -> str:
    """Build rich analysis context from stored analysis data."""
    result = await db.execute(
        select(Analysis).where(Analysis.project_id == project_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        return "(No aggregate analysis available yet)"

    sections = []

    # Sentiment distribution
    try:
        sentiment = json.loads(analysis.sentiment_distribution) if analysis.sentiment_distribution else {}
        if sentiment:
            total = sum(sentiment.values())
            dist_parts = []
            for label, count in sorted(sentiment.items(), key=lambda x: -x[1]):
                pct = (count / total * 100) if total > 0 else 0
                dist_parts.append(f"  {label}: {count} ({pct:.0f}%)")
            sections.append("SENTIMENT DISTRIBUTION:\n" + "\n".join(dist_parts))
    except (json.JSONDecodeError, TypeError):
        pass

    # Rating distribution
    try:
        ratings = json.loads(analysis.rating_distribution) if analysis.rating_distribution else {}
        if ratings:
            total = sum(ratings.values())
            avg = sum(int(k) * v for k, v in ratings.items()) / total if total else 0
            dist_parts = [f"  Average: {avg:.1f}/5"]
            for star in ["5", "4", "3", "2", "1"]:
                count = ratings.get(star, 0)
                pct = (count / total * 100) if total > 0 else 0
                bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
                dist_parts.append(f"  {star}★: {bar} {count} ({pct:.0f}%)")
            sections.append("RATING DISTRIBUTION:\n" + "\n".join(dist_parts))
    except (json.JSONDecodeError, TypeError):
        pass

    # Themes
    try:
        themes = json.loads(analysis.themes) if analysis.themes else []
        theme_labels = json.loads(analysis.theme_labels) if analysis.theme_labels else {}
        if themes:
            theme_parts = []
            for t in themes:
                idx = t.get("index", 0)
                label = theme_labels.get(str(idx), t.get("label", f"Theme {idx}"))
                keywords = ", ".join(t.get("keywords", [])[:8])
                avg_r = f" (avg rating: {t['avg_rating']:.1f}★)" if t.get("avg_rating") else ""
                sentiment = t.get("sentiment", "")
                count = t.get("review_count", 0)
                theme_parts.append(
                    f"  • {label} [{sentiment}] — {count} reviews{avg_r}\n"
                    f"    Keywords: {keywords}"
                )
            sections.append("DISCOVERED THEMES:\n" + "\n".join(theme_parts))
    except (json.JSONDecodeError, TypeError):
        pass

    # Pain points
    try:
        pain_points = json.loads(analysis.pain_points) if analysis.pain_points else []
        if pain_points:
            pp_parts = []
            for pp in pain_points:
                pp_parts.append(f"  • {pp['title']}: {pp['description']} (frequency: {pp['frequency']})")
            sections.append("KEY PAIN POINTS:\n" + "\n".join(pp_parts))
    except (json.JSONDecodeError, TypeError):
        pass

    # Highlights
    try:
        highlights = json.loads(analysis.highlights) if analysis.highlights else []
        if highlights:
            h_parts = []
            for h in highlights:
                h_parts.append(f"  • {h['title']}: {h['description']} (frequency: {h['frequency']})")
            sections.append("TOP HIGHLIGHTS:\n" + "\n".join(h_parts))
    except (json.JSONDecodeError, TypeError):
        pass

    # Executive summary
    if analysis.executive_summary:
        sections.append(f"EXECUTIVE SUMMARY:\n  {analysis.executive_summary}")

    # Recommendations
    try:
        recs = json.loads(analysis.recommendations) if analysis.recommendations else []
        if recs:
            r_parts = []
            for r in recs:
                r_parts.append(f"  • [{r['priority']}] {r['action']}: {r['rationale']}")
            sections.append("STRATEGIC RECOMMENDATIONS:\n" + "\n".join(r_parts))
    except (json.JSONDecodeError, TypeError):
        pass

    return "\n\n".join(sections) if sections else "(No aggregate analysis available yet)"


def _extract_followups(text: str) -> tuple[str, list[str]]:
    """Extract >>FOLLOWUP: lines from response, return cleaned text and suggestions."""
    followups = _FOLLOWUP_RE.findall(text)
    cleaned = _FOLLOWUP_RE.sub("", text).rstrip("\n ")
    return cleaned, followups[:4]


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
        fallback = context_aware_fallback(guard.category, question)
        return {
            "response": fallback,
            "sources": [],
            "guardrail_triggered": True,
            "guardrail_category": guard.category,
            "follow_ups": [],
        }

    # ── Fetch analysis context for richer responses ───────────────────────────
    analysis_context = await _get_analysis_context(project.id, db)

    # ── Layer 2: Build system prompt + call OpenAI ───────────────────────────
    system_prompt = AGENT_SYSTEM_PROMPT.format(
        product_name=project.product_name or "Unknown",
        review_count=project.review_count,
        platform=project.platform,
        date_range=_get_date_range(chunks),
        analysis_context=analysis_context,
        retrieved_chunks=_format_chunks(chunks),
    )

    messages = [{"role": "system", "content": system_prompt}]
    messages += history
    messages.append({"role": "user", "content": question})

    response = await _client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=1800,
        temperature=0.5,
        messages=messages,
    )
    raw_reply = response.choices[0].message.content or SAFE_FALLBACK

    # ── Extract follow-up suggestions ─────────────────────────────────────────
    reply, follow_ups = _extract_followups(raw_reply)

    # ── Layer 3: Post-validate ───────────────────────────────────────────────
    chunk_bodies = [c["body"] for c in chunks]
    post_guard = post_validate(reply, chunk_bodies)
    if not post_guard.allowed:
        fallback = context_aware_fallback("hallucination_detected", question)
        return {
            "response": fallback,
            "sources": [],
            "guardrail_triggered": True,
            "guardrail_category": post_guard.category,
            "follow_ups": [],
        }

    sources = [
        {
            "review_id": c["review_id"],
            "excerpt": c["body"][:350],
            "rating": c["rating"],
            "reviewer_name": c["reviewer_name"],
            "sentiment": c.get("sentiment"),
            "similarity": c.get("similarity"),
        }
        for c in chunks[:6]
    ]

    return {
        "response": reply,
        "sources": sources,
        "guardrail_triggered": False,
        "guardrail_category": None,
        "follow_ups": follow_ups,
    }
