import re
from dataclasses import dataclass

from app.agents.prompts import HALLUCINATION_MARKERS, OFF_TOPIC_PATTERNS

SAFE_FALLBACK = (
    "I can only answer questions about the reviews in this session. "
    "That question goes beyond the available review data. "
    "Try asking something like: 'What are the most common complaints?' "
    "or 'How has sentiment changed over time?'"
)

_CATEGORY_RESPONSES = {
    "off_topic": [
        "That's outside the scope of this review dataset. I'm built to perform forensic "
        "analysis on *these* reviews — not to answer general questions.",
        "",
        "Here are the kinds of patterns I'm good at finding:",
        "- **Frustrated loyalists** — users who love the product but are close to leaving over one issue",
        "- **Contradiction hotspots** — the same feature praised by some and condemned by others",
        "- **Silent signals** — what reviewers *don't* mention that reveals what they take for granted",
        "- **Temporal velocity** — whether issues are getting worse, stable, or resolving",
        "- **Reviewer psychology** — the gap between what people rate and what they actually write",
    ],
    "no_relevant_reviews": [
        "I searched through the reviews but couldn't find any that speak to that topic "
        "with enough specificity to give you a grounded answer.",
        "",
        "This usually means reviewers don't discuss that aspect — which is itself interesting. "
        "When something goes unmentioned, it's often either a non-issue or so expected that nobody "
        "thinks to write about it.",
        "",
        "Here are angles I *can* dig into with the available data:",
        "- What do reviewers feel most *strongly* about — positive or negative?",
        "- Where do reviewers contradict each other on the same feature?",
        "- What's the gap between what casual users and power users experience?",
        "- Are there any 5-star reviews hiding a \"but\" that signals future risk?",
    ],
    "hallucination_detected": [
        "I caught myself reaching beyond what the reviews actually say — so I'm pulling back. "
        "My analysis is only valuable when every claim maps to real evidence.",
        "",
        "Let me stick to what the data concretely supports. Try a more specific question:",
        "- What exact words do frustrated reviewers use to describe their experience?",
        "- Which specific aspects get mentioned in the most detailed 5-star reviews?",
        "- Are the negative reviews about the same issue, or are complaints scattered?",
        "- What do the longest, most detailed reviews focus on compared to short ones?",
    ],
}


def context_aware_fallback(category: str | None, question: str) -> str:
    """Generate a helpful, context-aware rejection message."""
    lines = _CATEGORY_RESPONSES.get(category or "", _CATEGORY_RESPONSES["off_topic"])
    return "\n".join(lines)


@dataclass
class GuardrailResult:
    allowed: bool
    rejection_reason: str | None = None
    category: str | None = None  # off_topic | no_relevant_reviews | hallucination_detected


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
    """Layer 3: Scan response for hallucination markers."""
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
