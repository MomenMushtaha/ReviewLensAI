import json
import logging
import random
import time
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log
from openai import AsyncOpenAI
from app.config import settings
from app.models.analysis import Analysis
from app.utils.text_cleaner import truncate

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=settings.openai_api_key)

SUMMARIZER_TOOL = {
    "type": "function",
    "function": {
        "name": "produce_summary",
        "description": "Produce structured analysis summary for product reviews",
        "parameters": {
            "type": "object",
            "properties": {
                "executive_summary": {
                    "type": "string",
                    "description": "2-3 paragraph executive summary of the product reputation"
                },
                "pain_points": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "frequency": {"type": "string", "enum": ["high", "medium", "low"]}
                        },
                        "required": ["title", "description", "frequency"]
                    }
                },
                "highlights": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "frequency": {"type": "string", "enum": ["high", "medium", "low"]}
                        },
                        "required": ["title", "description", "frequency"]
                    }
                },
                "recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                            "action": {"type": "string"},
                            "rationale": {"type": "string"}
                        },
                        "required": ["priority", "action", "rationale"]
                    }
                },
                "theme_labels": {
                    "type": "object",
                    "description": "Map of cluster index (as string) to a concise, descriptive theme title (3-6 words). Each title should clearly convey what the theme is about — e.g. 'Slow Delivery & Shipping Delays', 'Excellent Customer Support', 'App Crashes & Technical Issues'. Avoid generic labels like 'Theme 1', 'Positive Feedback', or 'Mixed Reviews'. Base each title on the cluster keywords and review content.",
                    "additionalProperties": {"type": "string"}
                }
            },
            "required": ["executive_summary", "pain_points", "highlights", "recommendations", "theme_labels"]
        }
    }
}


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
)
async def _call_openai(system_prompt: str, user_prompt: str) -> dict:
    api_start = time.monotonic()
    logger.info("OpenAI API call start: model=%s max_tokens=1500", settings.openai_model)
    response = await _client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=2500,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        tools=[SUMMARIZER_TOOL],
        tool_choice={"type": "function", "function": {"name": "produce_summary"}},
    )
    usage = response.usage
    logger.info(
        "OpenAI API response: elapsed=%.2fs prompt_tokens=%s completion_tokens=%s total_tokens=%s",
        time.monotonic() - api_start,
        usage.prompt_tokens if usage else "?",
        usage.completion_tokens if usage else "?",
        usage.total_tokens if usage else "?",
    )
    msg = response.choices[0].message
    if msg.tool_calls:
        for tc in msg.tool_calls:
            if tc.function.name == "produce_summary":
                result = json.loads(tc.function.arguments)
                logger.info(
                    "produce_summary parsed: keys=%s theme_labels=%d",
                    list(result.keys()), len(result.get("theme_labels", {})),
                )
                return result
    logger.error("OpenAI did not call produce_summary tool: finish_reason=%s", response.choices[0].finish_reason)
    raise ValueError("OpenAI did not call produce_summary tool")


async def summarize(
    analysis_data: dict,
    project_id: str,
    product_name: str | None,
    db: AsyncSession,
    progress_cb=None,
) -> dict:
    logger.info("Summarization start: project=%s product=%s", project_id, product_name or "Unknown")
    if progress_cb:
        await progress_cb("summarizing", 10, "Preparing review sample for AI…")

    # Sample reviews: top 5 positive, top 5 negative, 20 random
    all_reviews = analysis_data.get("sampled_reviews", [])
    positive = [r for r in all_reviews if r.get("sentiment") == "positive"]
    negative = [r for r in all_reviews if r.get("sentiment") == "negative"]
    rest = [r for r in all_reviews if r.get("sentiment") == "neutral"]

    sample = (
        positive[:5]
        + negative[:5]
        + random.sample(rest, min(20, len(rest)))
    )
    logger.info(
        "Review sample prepared: project=%s total=%d positive=%d negative=%d neutral=%d sampled=%d",
        project_id, len(all_reviews), len(positive), len(negative), len(rest), len(sample),
    )

    review_lines = []
    for i, r in enumerate(sample, 1):
        rating_str = f"★{r['rating']:.0f}" if r.get("rating") else ""
        body = truncate(r["body"], 300)
        review_lines.append(f"{i}. {rating_str} [{r.get('sentiment', '')}] {body}")

    themes = analysis_data.get("themes", [])
    theme_summary = "\n".join(
        f"- Cluster {t['index']} keywords: {', '.join(t['keywords'][:5])}"
        for t in themes
    )
    sentiment = analysis_data.get("sentiment_distribution", {})
    rating_dist = analysis_data.get("rating_distribution", {})

    # Build bias context for prompt (only detected signals)
    bias_context = ""
    bias_data = analysis_data.get("bias_analysis")
    if bias_data:
        detected = [s for s in bias_data.get("signals", []) if s.get("detected")]
        if detected:
            raw = bias_data.get("raw_rating", 0)
            adj = bias_data.get("adjusted_rating", 0)
            low = bias_data.get("confidence_low", adj)
            high = bias_data.get("confidence_high", adj)
            lines = [f"- {s['label']} ({s['strength']}): {s['evidence']}" for s in detected]
            bias_context = (
                f"\nBias-adjusted rating: The raw average is {raw:.1f} but after accounting for "
                f"detected biases, the bias-adjusted rating is {adj:.1f} "
                f"(confidence range: {low:.1f} – {high:.1f}).\n"
                f"Review bias signals detected ({bias_data.get('overall_bias_level', 'unknown')} overall):\n"
                + "\n".join(lines)
                + "\n\nIMPORTANT: Reference the bias-adjusted rating in the executive summary. "
                + "Explain what the raw vs adjusted rating means for this product.\n"
            )

    user_prompt = f"""Product: {product_name or 'Unknown'}
Total reviews: {len(all_reviews)}
Sentiment: {sentiment}
Rating distribution: {rating_dist}

Theme clusters:
{theme_summary}
{bias_context}
Sample reviews:
{chr(10).join(review_lines)}

Please produce a structured summary using the produce_summary tool."""

    system_prompt = (
        "You are a product intelligence analyst. Analyze the provided review data "
        "and produce a structured executive brief. Be specific, cite patterns from "
        "the data. Do not invent information not present in the reviews. "
        "When review bias signals are provided, incorporate that context into your "
        "executive summary — note how biases like negativity bias or scale effects "
        "might affect interpretation. Do not dismiss negative reviews, but provide "
        "calibrated context where biases are detected. "
        "For theme_labels, write clear descriptive titles (3-6 words) that capture "
        "the specific topic — e.g. 'Unreliable Refund Process', 'Friendly & Helpful Staff', "
        "'Hidden Fees & Pricing Complaints'. Never use generic labels like 'General Feedback' "
        "or 'Miscellaneous'."
    )

    if progress_cb:
        await progress_cb("summarizing", 40, "Calling AI…")

    logger.info(
        "Prompt prepared: project=%s themes=%d user_prompt_len=%d",
        project_id, len(themes), len(user_prompt),
    )
    summarize_start = time.monotonic()
    result = await _call_openai(system_prompt, user_prompt)
    logger.info(
        "OpenAI summarization done: project=%s elapsed=%.2fs pain_points=%d highlights=%d recommendations=%d",
        project_id, time.monotonic() - summarize_start,
        len(result.get("pain_points", [])),
        len(result.get("highlights", [])),
        len(result.get("recommendations", [])),
    )

    if progress_cb:
        await progress_cb("summarizing", 80, "Saving summary…")

    # Write back to analysis row
    theme_labels: dict = result.get("theme_labels", {})
    logger.info("Summarizer theme_labels keys=%s values=%s", list(theme_labels.keys()), list(theme_labels.values()))
    await db.execute(
        update(Analysis)
        .where(Analysis.project_id == project_id)
        .values(
            executive_summary=result.get("executive_summary"),
            pain_points=json.dumps(result.get("pain_points", [])),
            highlights=json.dumps(result.get("highlights", [])),
            recommendations=json.dumps(result.get("recommendations", [])),
            theme_labels=json.dumps(theme_labels),
        )
    )
    await db.commit()
    logger.info("Summary persisted to DB: project=%s theme_labels=%d", project_id, len(theme_labels))

    if progress_cb:
        await progress_cb("summarizing", 100, "Summary complete")

    return result
