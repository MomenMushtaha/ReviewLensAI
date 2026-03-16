from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.agents.prompts import HALLUCINATION_MARKERS, OFF_TOPIC_PATTERNS

if TYPE_CHECKING:
    from app.models.analysis import Analysis

SAFE_FALLBACK = (
    "I can only answer questions about the reviews in this session. "
    "That question goes beyond the available review data. "
    "Try asking something like: 'What are the most common complaints?' "
    "or 'How has sentiment changed over time?'"
)


@dataclass
class GuardrailResult:
    allowed: bool
    rejection_reason: str | None = None
    category: str | None = None  # off_topic | no_relevant_reviews | harmful_content


def pre_filter(question: str, has_relevant_chunks: bool) -> GuardrailResult:
    """Layer 1: Fast heuristic check before hitting the LLM."""
    q = question.lower()

    # Check off-topic patterns
    for pattern in OFF_TOPIC_PATTERNS:
        if re.search(pattern, q, re.IGNORECASE):
            return GuardrailResult(
                allowed=False,
                rejection_reason=f"Pattern matched: {pattern}",
                category="off_topic",
            )

    # Check if no relevant reviews were retrieved
    if not has_relevant_chunks:
        return GuardrailResult(
            allowed=False,
            rejection_reason="No relevant reviews found for this question",
            category="no_relevant_reviews",
        )

    return GuardrailResult(allowed=True)


def post_validate(response: str, retrieved_bodies: list[str]) -> GuardrailResult:
    """Layer 3: Scan Claude's response for hallucination markers."""
    lower = response.lower()

    for marker in HALLUCINATION_MARKERS:
        if marker in lower:
            return GuardrailResult(
                allowed=False,
                rejection_reason=f"Hallucination marker detected: '{marker}'",
                category="hallucination_detected",
            )

    # Flag external URLs that weren't in the retrieved reviews
    url_pattern = re.compile(r"https?://\S+")
    response_urls = set(url_pattern.findall(response))
    source_urls = set()
    for body in retrieved_bodies:
        source_urls.update(url_pattern.findall(body))
    external_urls = response_urls - source_urls
    if external_urls:
        return GuardrailResult(
            allowed=False,
            rejection_reason=f"Response contained external URLs: {external_urls}",
            category="hallucination_detected",
        )

    return GuardrailResult(allowed=True)


def _parse_json_field(value: str | None) -> list | dict:
    if not value:
        return []
    try:
        return json.loads(value) if isinstance(value, str) else value
    except (json.JSONDecodeError, TypeError):
        return []


def get_contextual_fallback(
    category: str | None, analysis: Analysis | None = None
) -> str:
    """Generate a category-specific rejection message referencing actual analysis data."""
    theme_names: list[str] = []
    if analysis and analysis.theme_labels:
        labels = _parse_json_field(analysis.theme_labels)
        if isinstance(labels, dict):
            theme_names = list(labels.values())[:4]

    pain_point_titles: list[str] = []
    if analysis and analysis.pain_points:
        pp = _parse_json_field(analysis.pain_points)
        if isinstance(pp, list):
            pain_point_titles = [p.get("title", "") for p in pp[:3] if isinstance(p, dict) and p.get("title")]

    if category == "off_topic":
        base = "That question falls outside the scope of this review analysis."
        if theme_names:
            suggestions = ", ".join(f'"{t}"' for t in theme_names[:3])
            return f"{base} I can help you explore themes like {suggestions} that emerged from these reviews."
        return f"{base} Try asking about sentiment patterns, common complaints, or what customers appreciate most."

    if category == "no_relevant_reviews":
        base = "I couldn't find reviews directly relevant to that question."
        if pain_point_titles:
            alt = " or ".join(f'"{t}"' for t in pain_point_titles[:2])
            return f"{base} You might want to ask about pain points like {alt} which appear frequently in the data."
        return f"{base} Try rephrasing, or ask about overall sentiment, top complaints, or standout praise."

    if category == "hallucination_detected":
        return (
            "I want to make sure I only share insights grounded in the actual reviews. "
            "Could you rephrase your question, or ask about a specific aspect of "
            "the customer feedback?"
        )

    return SAFE_FALLBACK


def get_fallback_suggestions(analysis: Analysis | None = None) -> list[str]:
    """Generate contextual follow-up suggestions for guardrail-blocked messages."""
    suggestions: list[str] = []

    if analysis:
        if analysis.pain_points:
            pp = _parse_json_field(analysis.pain_points)
            if isinstance(pp, list) and pp and isinstance(pp[0], dict):
                title = pp[0].get("title", "the top complaint")
                suggestions.append(f'What do reviewers say about "{title}"?')

        if analysis.highlights:
            hl = _parse_json_field(analysis.highlights)
            if isinstance(hl, list) and hl and isinstance(hl[0], dict):
                title = hl[0].get("title", "the product")
                suggestions.append(f'Why do customers praise "{title}"?')

        if analysis.theme_labels:
            labels = _parse_json_field(analysis.theme_labels)
            if isinstance(labels, dict):
                label_list = list(labels.values())
                if len(label_list) > 1:
                    suggestions.append(
                        f'How does "{label_list[0]}" compare to "{label_list[1]}" in the reviews?'
                    )

    defaults = [
        "What are the most common complaints?",
        "What do customers love most?",
        "How has sentiment changed over time?",
    ]
    for d in defaults:
        if d not in suggestions and len(suggestions) < 3:
            suggestions.append(d)

    return suggestions[:3]
