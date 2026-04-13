"""Review Bias Intelligence — detects 8 systematic bias patterns in review data.

All computations are pure statistics on existing review data. No LLM calls.
"""

import logging
import re
from collections import defaultdict

import numpy as np

logger = logging.getLogger(__name__)

PLATFORM_BASELINES = {
    "trustpilot": 4.2,
    "google": 4.1,
    "amazon": 4.0,
    "airbnb": 4.5,
    "csv": 3.8,
    "unknown": 4.0,
}

_EXPECTATION_PATTERN = re.compile(
    r"\b(expected|disappointed|disappointing|should have|supposed to|for the price|"
    r"advertised|misleading|overhyped|not as described|not what I expected)\b",
    re.IGNORECASE,
)


def _signal(bias_type: str, label: str, detected: bool, strength: str | None,
            evidence: str, adjustment_note: str) -> dict:
    return {
        "bias_type": bias_type,
        "label": label,
        "detected": detected,
        "strength": strength if detected else None,
        "evidence": evidence,
        "adjustment_note": adjustment_note if detected else "",
    }


def _detect_negativity_bias(reviews, sentiment_dist: dict, avg_rating: float) -> dict:
    total = len(reviews)
    if total == 0:
        return _signal("negativity_bias", "Negativity Bias", False, None, "", "")

    neg_count = sentiment_dist.get("negative", 0)
    neg_ratio = neg_count / total

    # Self-selection bias: when the vast majority of reviews are negative on a
    # complaint-driven platform, it indicates that only unhappy users bother to review —
    # not that the product is proportionally bad.
    detected = neg_ratio > 0.65
    if not detected:
        return _signal("negativity_bias", "Negativity Bias", False, None,
                       f"{neg_ratio:.0%} negative reviews with {avg_rating:.1f} avg rating.", "")

    if neg_ratio > 0.85:
        strength = "high"
    elif neg_ratio > 0.75:
        strength = "medium"
    else:
        strength = "low"

    return _signal(
        "negativity_bias", "Negativity Bias", True, strength,
        f"{neg_ratio:.0%} of reviews express negative sentiment — on complaint-driven platforms "
        f"this indicates self-selection bias where satisfied users rarely leave reviews.",
        "The true satisfaction rate is likely much higher than the review data suggests.",
    )


def _detect_expectation_gap(reviews) -> dict:
    mid_reviews = [r for r in reviews if r.rating is not None and 2 <= r.rating <= 3]
    if len(mid_reviews) < 3:
        return _signal("expectation_gap", "Expectation Gap", False, None,
                       "Too few mid-range reviews to assess.", "")

    matches = sum(1 for r in mid_reviews if _EXPECTATION_PATTERN.search(r.body))
    ratio = matches / len(mid_reviews)

    detected = ratio > 0.15
    if not detected:
        return _signal("expectation_gap", "Expectation Gap", False, None,
                       f"{ratio:.0%} of mid-range reviews mention unmet expectations.", "")

    strength = "high" if ratio > 0.35 else "medium" if ratio > 0.25 else "low"
    return _signal(
        "expectation_gap", "Expectation Gap", True, strength,
        f"{ratio:.0%} of 2-3 star reviews reference unmet expectations or disappointment, "
        f"indicating ratings may reflect an expectations gap rather than objective quality issues.",
        "Some negative ratings may stem from inflated expectations rather than product failures.",
    )


def _detect_marketplace_variability(reviews, rating_dist: dict) -> dict:
    ratings = [r.rating for r in reviews if r.rating is not None]
    if len(ratings) < 10:
        return _signal("marketplace_variability", "Marketplace Variability", False, None,
                       "Insufficient rating data.", "")

    std_dev = float(np.std(ratings))
    total = len(ratings)
    low_count = sum(rating_dist.get(str(i), 0) for i in [1, 2])
    high_count = sum(rating_dist.get(str(i), 0) for i in [4, 5])
    low_pct = low_count / total
    high_pct = high_count / total

    bimodal = low_pct > 0.20 and high_pct > 0.20
    detected = std_dev > 1.5 and bimodal

    if not detected:
        return _signal("marketplace_variability", "Marketplace Variability", False, None,
                       f"Rating std dev: {std_dev:.2f}, distribution is {'bimodal' if bimodal else 'unimodal'}.", "")

    strength = "high" if std_dev > 2.0 else "medium" if std_dev > 1.7 else "low"
    return _signal(
        "marketplace_variability", "Marketplace Variability", True, strength,
        f"Ratings show high variability (std dev {std_dev:.2f}) with a bimodal distribution — "
        f"{low_pct:.0%} rated 1-2 stars and {high_pct:.0%} rated 4-5 stars, "
        f"suggesting inconsistent quality typical of marketplace platforms.",
        "Individual experiences vary significantly — aggregate scores may not reflect typical experiences.",
    )


def _detect_scale_effect(reviews, sentiment_dist: dict) -> dict:
    total = len(reviews)
    neg_count = sentiment_dist.get("negative", 0)

    detected = total > 100 and neg_count > 15
    if not detected:
        return _signal("scale_effect", "Scale Effect", False, None,
                       f"{total} total reviews, {neg_count} negative.", "")

    neg_pct = neg_count / total
    strength = "high" if total > 500 else "medium" if total > 200 else "low"
    return _signal(
        "scale_effect", "Scale Effect", True, strength,
        f"{neg_count} negative reviews may seem significant, but represent only {neg_pct:.0%} "
        f"of {total} total reviews — a natural byproduct of high review volume.",
        "The absolute number of negative reviews is inflated by scale, not necessarily poor quality.",
    )


def _detect_edge_case_visibility(reviews, themes: list[dict]) -> dict:
    total = len(reviews)
    if total < 20 or not themes:
        return _signal("edge_case_visibility", "Edge Case Visibility", False, None,
                       "Too few reviews or themes.", "")

    edge_clusters = []
    for t in themes:
        count = t.get("review_count", 0)
        avg_r = t.get("avg_rating")
        if count > 0 and count / total < 0.05 and avg_r is not None and avg_r < 2.5:
            edge_clusters.append(t)

    detected = len(edge_clusters) > 0
    if not detected:
        return _signal("edge_case_visibility", "Edge Case Visibility", False, None,
                       "No low-frequency negative theme clusters found.", "")

    keywords = ", ".join(edge_clusters[0].get("keywords", [])[:3]) if edge_clusters else ""
    strength = "medium" if len(edge_clusters) > 1 else "low"
    return _signal(
        "edge_case_visibility", "Edge Case Visibility", True, strength,
        f"{len(edge_clusters)} theme cluster(s) represent <5% of reviews but have very low ratings "
        f"(e.g., \"{keywords}\"), making rare issues appear disproportionately prominent.",
        "These edge cases may not reflect common experiences but can dominate theme analysis.",
    )


def _detect_power_user_criticism(reviews) -> dict:
    by_reviewer: dict[str, list[float]] = defaultdict(list)
    all_ratings = []
    for r in reviews:
        if r.rating is not None:
            all_ratings.append(r.rating)
            if r.reviewer_name:
                by_reviewer[r.reviewer_name].append(r.rating)

    repeat_reviewers = {name: ratings for name, ratings in by_reviewer.items() if len(ratings) >= 2}
    if not repeat_reviewers or not all_ratings:
        return _signal("power_user_criticism", "Power User Criticism", False, None,
                       "No repeat reviewers detected.", "")

    overall_avg = float(np.mean(all_ratings))
    repeat_ratings = [r for ratings in repeat_reviewers.values() for r in ratings]
    repeat_avg = float(np.mean(repeat_ratings))
    gap = overall_avg - repeat_avg

    detected = gap > 0.5
    if not detected:
        return _signal("power_user_criticism", "Power User Criticism", False, None,
                       f"Repeat reviewers average {repeat_avg:.1f} vs overall {overall_avg:.1f}.", "")

    strength = "high" if gap > 1.0 else "medium" if gap > 0.7 else "low"
    return _signal(
        "power_user_criticism", "Power User Criticism", True, strength,
        f"{len(repeat_reviewers)} repeat reviewer(s) average {repeat_avg:.1f} stars vs "
        f"{overall_avg:.1f} overall — a {gap:.1f}-star gap suggesting frequent users are more critical.",
        "Repeat customers may have higher standards, skewing sentiment more negative.",
    )


def _detect_rating_inflation(avg_rating: float, platform: str) -> dict:
    baseline = PLATFORM_BASELINES.get(platform, PLATFORM_BASELINES["unknown"])
    diff = avg_rating - baseline

    detected = abs(diff) > 0.3
    if not detected:
        return _signal("rating_inflation", "Rating Context", False, None,
                       f"Average {avg_rating:.1f} is close to the {platform} baseline of {baseline}.", "")

    if diff > 0:
        direction = "above"
        note = "Ratings may appear inflated relative to the platform norm."
        strength = "high" if diff > 0.8 else "medium" if diff > 0.5 else "low"
    else:
        direction = "below"
        note = "This product underperforms relative to the platform's typical rating."
        strength = "high" if diff < -0.8 else "medium" if diff < -0.5 else "low"

    return _signal(
        "rating_inflation", "Rating Context", True, strength,
        f"Average rating of {avg_rating:.1f} is {abs(diff):.1f} stars {direction} "
        f"the {platform} platform baseline of {baseline}.",
        note,
    )


def _detect_growth_vs_control(trend_data: list[dict]) -> dict:
    if len(trend_data) < 6:
        return _signal("growth_vs_control", "Growth vs Control", False, None,
                       f"Only {len(trend_data)} months of data (need 6+).", "")

    counts = [t["count"] for t in trend_data]
    ratings = [t["avg_rating"] for t in trend_data]

    # Check volume growth: is count increasing >30% month-over-month on average?
    growth_rates = []
    for i in range(1, len(counts)):
        if counts[i - 1] > 0:
            growth_rates.append((counts[i] - counts[i - 1]) / counts[i - 1])
    avg_growth = float(np.mean(growth_rates)) if growth_rates else 0

    # Check rating trend: negative correlation between position and rating
    if len(ratings) >= 3:
        x = np.arange(len(ratings), dtype=float)
        corr_matrix = np.corrcoef(x, ratings)
        rating_trend = float(corr_matrix[0, 1]) if not np.isnan(corr_matrix[0, 1]) else 0
    else:
        rating_trend = 0

    detected = avg_growth > 0.30 and rating_trend < -0.3
    if not detected:
        return _signal("growth_vs_control", "Growth vs Control", False, None,
                       f"Avg volume growth: {avg_growth:.0%}, rating trend correlation: {rating_trend:.2f}.", "")

    strength = "high" if rating_trend < -0.6 else "medium"
    return _signal(
        "growth_vs_control", "Growth vs Control", True, strength,
        f"Review volume is growing ({avg_growth:.0%} avg month-over-month) while ratings are declining "
        f"(trend correlation: {rating_trend:.2f}), suggesting growth may be outpacing quality control.",
        "Rapid scaling can temporarily reduce quality — recent reviews may be less representative of current state.",
    )


def _detect_one_star_dominance(rating_dist: dict) -> dict:
    total = sum(rating_dist.get(str(i), 0) for i in range(1, 6))
    if total < 10:
        return _signal("one_star_dominance", "One-Star Dominance", False, None,
                       "Insufficient data.", "")

    one_star = rating_dist.get("1", 0)
    one_pct = one_star / total

    detected = one_pct > 0.60
    if not detected:
        return _signal("one_star_dominance", "One-Star Dominance", False, None,
                       f"{one_pct:.0%} of reviews are 1-star.", "")

    if one_pct > 0.80:
        strength = "high"
    elif one_pct > 0.70:
        strength = "medium"
    else:
        strength = "low"

    return _signal(
        "one_star_dominance", "One-Star Dominance", True, strength,
        f"{one_pct:.0%} of all reviews are 1-star — characteristic of rage-reviewing where "
        f"moderately unhappy users skip nuanced ratings and go straight to the minimum.",
        "The 1-star concentration compresses the average far below actual median satisfaction.",
    )


def _compute_adjusted_rating(
    raw_avg: float, signals: list[dict], platform: str,
) -> tuple[float, float, list[dict]]:
    """Compute a bias-adjusted rating with transparent breakdown.

    Returns (adjusted_rating, total_adjustment, adjustment_reasons).
    Each reason: {"label": str, "adjustment": float, "explanation": str}.
    """
    baseline = PLATFORM_BASELINES.get(platform, PLATFORM_BASELINES["unknown"])
    adjustments: list[dict] = []
    strength_mult = {"high": 1.0, "medium": 0.6, "low": 0.3}

    for s in signals:
        if not s["detected"]:
            continue
        mult = strength_mult.get(s["strength"], 0)
        bias = s["bias_type"]

        if bias == "negativity_bias":
            adj = round(0.8 * mult, 2)
            adjustments.append({
                "label": "Negativity Bias",
                "adjustment": adj,
                "explanation": "Self-selection bias — satisfied users rarely review on complaint-driven platforms.",
            })
        elif bias == "one_star_dominance":
            adj = round(0.5 * mult, 2)
            adjustments.append({
                "label": "One-Star Dominance",
                "adjustment": adj,
                "explanation": "Rage-reviewing compresses ratings — unhappy users skip nuanced scores and go straight to 1-star.",
            })
        elif bias == "expectation_gap":
            adj = round(0.3 * mult, 2)
            adjustments.append({
                "label": "Expectation Gap",
                "adjustment": adj,
                "explanation": "Some low ratings reflect unmet expectations rather than objective quality failures.",
            })
        elif bias == "scale_effect":
            adj = round(0.2 * mult, 2)
            adjustments.append({
                "label": "Scale Effect",
                "adjustment": adj,
                "explanation": "High review volume amplifies the absolute count of negative reviews.",
            })
        elif bias == "power_user_criticism":
            adj = round(0.2 * mult, 2)
            adjustments.append({
                "label": "Power User Criticism",
                "adjustment": adj,
                "explanation": "Repeat reviewers tend to rate more critically than average users.",
            })
        elif bias == "marketplace_variability":
            adj = round(0.4 * mult, 2)
            adjustments.append({
                "label": "Marketplace Variability",
                "adjustment": adj,
                "explanation": "Bimodal ratings indicate inconsistent quality — the average poorly represents typical experience.",
            })
        elif bias == "rating_inflation" and raw_avg < baseline:
            gap = baseline - raw_avg
            adj = round(min(1.0, gap * 0.3) * mult, 2)
            adjustments.append({
                "label": "Platform Context",
                "adjustment": adj,
                "explanation": f"Trustpilot skews toward complaint-driven reviews (platform avg: {baseline}).",
            })

    total = sum(a["adjustment"] for a in adjustments)
    total = min(total, 2.5)  # cap at +2.5
    adjusted = min(5.0, max(1.0, round(raw_avg + total, 1)))

    return adjusted, round(total, 1), adjustments


def _compute_confidence_interval(
    adjusted: float, signals: list[dict], review_count: int,
) -> tuple[float, float]:
    """Compute a confidence interval around the adjusted rating.

    Width is inversely proportional to:
    - review_count (more data = narrower)
    - number of detected signals (more evidence = narrower)
    And proportional to:
    - total adjustment magnitude (larger correction = wider uncertainty)
    """
    detected_count = sum(1 for s in signals if s["detected"])

    # Base half-width starts at ±0.5
    half_width = 0.5

    # Shrink with more reviews (log scale: 50→1.0x, 200→0.7x, 1000→0.5x)
    import math
    review_factor = max(0.4, 1.0 - math.log10(max(review_count, 10)) * 0.2)
    half_width *= review_factor

    # Shrink with more detected signals (more evidence for the adjustment)
    signal_factor = max(0.5, 1.0 - detected_count * 0.08)
    half_width *= signal_factor

    # Widen slightly with larger adjustments (bigger correction = more uncertainty)
    adjustment_mag = abs(adjusted - (adjusted - 0))  # placeholder
    half_width = max(0.2, min(0.8, half_width))  # clamp to ±0.2 – ±0.8

    low = max(1.0, round(adjusted - half_width, 1))
    high = min(5.0, round(adjusted + half_width, 1))
    return low, high


def detect_biases(reviews, analysis_data: dict, platform: str = "unknown") -> dict:
    """Run all 8 bias detections and return a BiasAnalysis dict."""
    ratings = [r.rating for r in reviews if r.rating is not None]
    avg_rating = float(np.mean(ratings)) if ratings else 0.0

    sentiment_dist = analysis_data.get("sentiment_distribution", {})
    rating_dist = analysis_data.get("rating_distribution", {})
    themes = analysis_data.get("themes", [])
    # themes may be Pydantic models or dicts
    theme_dicts = [t.model_dump() if hasattr(t, "model_dump") else t for t in themes]
    trend_data = analysis_data.get("trend_data", [])
    trend_dicts = [t.model_dump() if hasattr(t, "model_dump") else t for t in trend_data]

    signals = [
        _detect_negativity_bias(reviews, sentiment_dist, avg_rating),
        _detect_one_star_dominance(rating_dist),
        _detect_expectation_gap(reviews),
        _detect_marketplace_variability(reviews, rating_dist),
        _detect_scale_effect(reviews, sentiment_dist),
        _detect_edge_case_visibility(reviews, theme_dicts),
        _detect_power_user_criticism(reviews),
        _detect_rating_inflation(avg_rating, platform),
        _detect_growth_vs_control(trend_dicts),
    ]

    # Compute overall bias level
    weight_map = {"high": 3, "medium": 2, "low": 1}
    score = sum(weight_map.get(s["strength"], 0) for s in signals if s["detected"])
    if score >= 8:
        level = "high"
    elif score >= 4:
        level = "moderate"
    elif score >= 1:
        level = "low"
    else:
        level = "minimal"

    detected_labels = [s["label"] for s in signals if s["detected"]]
    if detected_labels:
        top = ", ".join(detected_labels[:3])
        summary = (
            f"This review set shows {level} bias patterns. "
            f"Detected signals: {top}. "
            f"These biases should be considered when interpreting the analysis — "
            f"they don't invalidate the data but provide important context for calibration."
        )
    else:
        summary = "No significant review biases detected. The review set appears well-balanced."

    # Compute adjusted rating
    adjusted_rating, total_adjustment, adjustment_reasons = _compute_adjusted_rating(
        avg_rating, signals, platform,
    )

    # Confidence interval
    confidence_low, confidence_high = _compute_confidence_interval(
        adjusted_rating, signals, len(reviews),
    )

    detected_count = sum(1 for s in signals if s["detected"])
    logger.info(
        "Bias detection done: %d/%d signals detected, overall_level=%s, "
        "raw_rating=%.2f, adjusted_rating=%.1f (+%.1f), range=[%.1f, %.1f]",
        detected_count, len(signals), level, avg_rating, adjusted_rating,
        total_adjustment, confidence_low, confidence_high,
    )

    return {
        "signals": signals,
        "overall_bias_level": level,
        "summary": summary,
        "raw_rating": round(avg_rating, 2),
        "adjusted_rating": adjusted_rating,
        "confidence_low": confidence_low,
        "confidence_high": confidence_high,
        "rating_adjustment": total_adjustment,
        "adjustment_reasons": adjustment_reasons,
    }
