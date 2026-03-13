import re
from dataclasses import dataclass

from app.agents.prompts import HALLUCINATION_MARKERS, OFF_TOPIC_PATTERNS

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
