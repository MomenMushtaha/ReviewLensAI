import json
import random
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_exponential
from openai import AsyncOpenAI

from app.config import settings
from app.models.analysis import Analysis
from app.utils.text_cleaner import truncate

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
                    "description": "Map of cluster index (as string) to human-readable theme label",
                    "additionalProperties": {"type": "string"}
                }
            },
            "required": ["executive_summary", "pain_points", "highlights", "recommendations", "theme_labels"]
        }
    }
}


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def _call_openai(system_prompt: str, user_prompt: str) -> dict:
    response = await _client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=1500,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        tools=[SUMMARIZER_TOOL],
        tool_choice={"type": "function", "function": {"name": "produce_summary"}},
    )
    msg = response.choices[0].message
    if msg.tool_calls:
        for tc in msg.tool_calls:
            if tc.function.name == "produce_summary":
                return json.loads(tc.function.arguments)
    raise ValueError("OpenAI did not call produce_summary tool")


async def summarize(
    analysis_data: dict,
    project_id: str,
    product_name: str | None,
    db: AsyncSession,
    progress_cb=None,
) -> dict:
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

    user_prompt = f"""Product: {product_name or 'Unknown'}
Total reviews: {len(all_reviews)}
Sentiment: {sentiment}
Rating distribution: {rating_dist}

Theme clusters:
{theme_summary}

Sample reviews:
{chr(10).join(review_lines)}

Please produce a structured summary using the produce_summary tool."""

    system_prompt = (
        "You are a product intelligence analyst. Analyze the provided review data "
        "and produce a structured executive brief. Be specific, cite patterns from "
        "the data. Do not invent information not present in the reviews."
    )

    if progress_cb:
        await progress_cb("summarizing", 40, "Calling AI…")

    result = await _call_openai(system_prompt, user_prompt)

    if progress_cb:
        await progress_cb("summarizing", 80, "Saving summary…")

    # Write back to analysis row
    theme_labels: dict = result.get("theme_labels", {})
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

    if progress_cb:
        await progress_cb("summarizing", 100, "Summary complete")

    return result
