from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI

from app.config import settings
from app.database import get_embedder
from app.models.project import Project
from app.agents.guardrails import (
    pre_filter,
    post_validate,
    get_contextual_fallback,
    get_fallback_suggestions,
    SAFE_FALLBACK,
)
from app.agents.prompts import AGENT_SYSTEM_PROMPT, ANALYSIS_CONTEXT_TEMPLATE

if TYPE_CHECKING:
    from app.models.analysis import Analysis

_client = AsyncOpenAI(api_key=settings.openai_api_key)

_FOLLOW_UP_RE = re.compile(r"FOLLOW_UPS:\s*\[(.+)\]\s*$", re.MULTILINE)


async def _retrieve_chunks(question: str, project_id: str, db: AsyncSession) -> list[dict]:
    embedder = get_embedder()
    if not embedder:
        return []

    embeddings = await embedder.encode([question])
    q_emb = embeddings[0]
    q_emb_str = "[" + ",".join(str(x) for x in q_emb) + "]"

    result = await db.execute(
        text("""
            SELECT id, body, reviewer_name, rating, date,
                   1 - (embedding <=> CAST(:qemb AS vector)) AS similarity
            FROM reviews
            WHERE project_id = :pid
              AND embedding IS NOT NULL
              AND 1 - (embedding <=> CAST(:qemb AS vector)) >= :threshold
            ORDER BY embedding <=> CAST(:qemb AS vector)
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


def _safe_json(value: str | None) -> list | dict:
    if not value:
        return []
    try:
        return json.loads(value) if isinstance(value, str) else value
    except (json.JSONDecodeError, TypeError):
        return []


def _format_analysis_context(analysis: Analysis | None) -> str:
    if not analysis:
        return "No pre-computed analysis available. Answer only from the review excerpts."

    # Sentiment
    sent = _safe_json(analysis.sentiment_distribution)
    if isinstance(sent, dict):
        total = sum(sent.values()) or 1
        sentiment_summary = ", ".join(
            f"{k}: {v} ({v * 100 // total}%)" for k, v in sent.items()
        )
    else:
        sentiment_summary = "Not available"

    # Ratings
    ratings = _safe_json(analysis.rating_distribution)
    if isinstance(ratings, dict):
        rating_summary = ", ".join(
            f"{k}-star: {v}"
            for k, v in sorted(ratings.items(), key=lambda x: x[0], reverse=True)
        )
    else:
        rating_summary = "Not available"

    # Themes
    themes_raw = _safe_json(analysis.themes)
    labels = _safe_json(analysis.theme_labels) if analysis.theme_labels else {}
    if not isinstance(labels, dict):
        labels = {}
    theme_lines = []
    if isinstance(themes_raw, list):
        for t in themes_raw[:8]:
            if not isinstance(t, dict):
                continue
            label = labels.get(str(t.get("index", "")), "") or ", ".join(
                t.get("keywords", [])[:3]
            )
            theme_lines.append(
                f"  - {label} ({t.get('review_count', 0)} reviews, "
                f"{t.get('sentiment', 'neutral')} sentiment, "
                f"avg {t.get('avg_rating', 'N/A')}★)"
            )
    themes_summary = "\n".join(theme_lines) or "  None identified"

    # Pain points
    pp_raw = _safe_json(analysis.pain_points)
    pp_lines = []
    if isinstance(pp_raw, list):
        pp_lines = [
            f"  - {p['title']} (frequency: {p['frequency']})"
            for p in pp_raw[:5]
            if isinstance(p, dict) and p.get("title")
        ]
    pain_points_summary = "\n".join(pp_lines) or "  None identified"

    # Highlights
    hl_raw = _safe_json(analysis.highlights)
    hl_lines = []
    if isinstance(hl_raw, list):
        hl_lines = [
            f"  - {h['title']} (frequency: {h['frequency']})"
            for h in hl_raw[:5]
            if isinstance(h, dict) and h.get("title")
        ]
    highlights_summary = "\n".join(hl_lines) or "  None identified"

    # Recommendations
    rec_raw = _safe_json(analysis.recommendations)
    rec_lines = []
    if isinstance(rec_raw, list):
        rec_lines = [
            f"  - [{r['priority'].upper()}] {r['action']}"
            for r in rec_raw[:4]
            if isinstance(r, dict) and r.get("priority") and r.get("action")
        ]
    recommendations_summary = "\n".join(rec_lines) or "  None available"

    # Executive summary (truncate to save tokens)
    exec_summary = (analysis.executive_summary or "Not available")[:300]

    return ANALYSIS_CONTEXT_TEMPLATE.format(
        sentiment_summary=sentiment_summary,
        rating_summary=rating_summary,
        theme_count=len(themes_raw) if isinstance(themes_raw, list) else 0,
        themes_summary=themes_summary,
        pain_points_summary=pain_points_summary,
        highlights_summary=highlights_summary,
        recommendations_summary=recommendations_summary,
        executive_summary=exec_summary,
    )


def _parse_follow_ups(text: str) -> tuple[str, list[str]]:
    """Extract follow-up suggestions from the response and return cleaned text + follow-ups."""
    match = _FOLLOW_UP_RE.search(text)
    if not match:
        return text.strip(), []
    follow_ups_raw = match.group(1)
    follow_ups = re.findall(r'"([^"]+)"', follow_ups_raw)
    clean_text = text[: match.start()].strip()
    return clean_text, follow_ups[:3]


def _generate_follow_ups(
    question: str, analysis: Analysis | None
) -> list[str]:
    """Build contextual follow-ups from analysis data when LLM doesn't produce them."""
    if not analysis:
        return get_fallback_suggestions(analysis)

    q_lower = question.lower()
    candidates: list[str] = []

    # Pain points not already asked about
    pp = _safe_json(analysis.pain_points)
    if isinstance(pp, list):
        for p in pp[:4]:
            if isinstance(p, dict) and p.get("title"):
                title = p["title"]
                if title.lower() not in q_lower:
                    candidates.append(f'What do reviewers say about "{title}"?')

    # Highlights not already asked about
    hl = _safe_json(analysis.highlights)
    if isinstance(hl, list):
        for h in hl[:4]:
            if isinstance(h, dict) and h.get("title"):
                title = h["title"]
                if title.lower() not in q_lower:
                    candidates.append(f'Why do customers praise "{title}"?')

    # Theme comparisons
    labels = _safe_json(analysis.theme_labels) if analysis.theme_labels else {}
    if isinstance(labels, dict):
        label_list = list(labels.values())
        for label in label_list[:4]:
            if label.lower() not in q_lower:
                candidates.append(f'Tell me more about the "{label}" theme')
                break

    # Sentiment/rating questions if not already asked
    if "sentiment" not in q_lower:
        candidates.append("What's the overall sentiment breakdown?")
    if "rating" not in q_lower and "star" not in q_lower:
        candidates.append("How are the star ratings distributed?")

    return candidates[:3]


async def answer(
    question: str,
    project: Project,
    history: list[dict],
    db: AsyncSession,
    analysis: Analysis | None = None,
) -> dict:
    # ── Layer 1: Retrieve first to check relevance ───────────────────────────
    chunks = await _retrieve_chunks(question, project.id, db)
    has_chunks = len(chunks) > 0

    guard = pre_filter(question, has_chunks)
    if not guard.allowed:
        return {
            "response": get_contextual_fallback(guard.category, analysis),
            "sources": [],
            "guardrail_triggered": True,
            "guardrail_category": guard.category,
            "follow_ups": get_fallback_suggestions(analysis),
        }

    # ── Layer 2: Build system prompt + call OpenAI ───────────────────────────
    analysis_context = _format_analysis_context(analysis)
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
        max_tokens=1200,
        messages=messages,
    )
    raw_reply = response.choices[0].message.content or ""
    reply, follow_ups = _parse_follow_ups(raw_reply)
    if not reply:
        reply = SAFE_FALLBACK

    # ── Layer 3: Post-validate ───────────────────────────────────────────────
    chunk_bodies = [c["body"] for c in chunks]
    post_guard = post_validate(reply, chunk_bodies)
    if not post_guard.allowed:
        return {
            "response": get_contextual_fallback(post_guard.category, analysis),
            "sources": [],
            "guardrail_triggered": True,
            "guardrail_category": post_guard.category,
            "follow_ups": get_fallback_suggestions(analysis),
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

    # Fallback: generate follow-ups from analysis data if LLM didn't produce them
    if not follow_ups:
        follow_ups = _generate_follow_ups(question, analysis)

    return {
        "response": reply,
        "sources": sources,
        "guardrail_triggered": False,
        "guardrail_category": None,
        "follow_ups": follow_ups,
    }
