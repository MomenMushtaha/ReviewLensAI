"""Tests for the 9-signal bias detection engine."""
from types import SimpleNamespace
from app.pipeline.bias_detector import detect_biases


def _review(body="Great product", rating=5.0, platform="trustpilot",
            reviewer_name=None, date=None):
    """Create a mock review matching the Review model interface."""
    return SimpleNamespace(
        body=body, rating=rating, platform=platform,
        reviewer_name=reviewer_name, date=date,
    )


def _analysis(sentiment=None, ratings=None, themes=None, trend=None):
    """Build an analysis_data dict with sensible defaults."""
    return {
        "sentiment_distribution": sentiment or {"positive": 0, "negative": 0, "neutral": 0},
        "rating_distribution": ratings or {str(i): 0 for i in range(1, 6)},
        "themes": themes or [],
        "trend_data": trend or [],
    }


# ── Structure ────────────────────────────────────────────────────────────────

def test_returns_all_nine_signals():
    reviews = [_review(rating=4.0) for _ in range(10)]
    result = detect_biases(reviews, _analysis(sentiment={"positive": 10, "negative": 0, "neutral": 0}))
    assert len(result["signals"]) == 9
    assert result["overall_bias_level"] in ("high", "moderate", "low", "minimal")
    assert "raw_rating" in result
    assert "adjusted_rating" in result
    assert "adjustment_reasons" in result


def test_no_bias_when_balanced():
    reviews = [_review(body="Fine", rating=4.0) for _ in range(20)]
    result = detect_biases(
        reviews,
        _analysis(
            sentiment={"positive": 12, "negative": 4, "neutral": 4},
            ratings={"1": 0, "2": 2, "3": 2, "4": 8, "5": 8},
        ),
    )
    detected = [s for s in result["signals"] if s["detected"]]
    assert len(detected) == 0
    assert result["overall_bias_level"] == "minimal"
    assert result["rating_adjustment"] == 0


# ── Negativity Bias ──────────────────────────────────────────────────────────

def test_negativity_bias_detected_at_high_neg_ratio():
    reviews = [_review(body="Terrible", rating=1.0) for _ in range(80)] + \
              [_review(body="OK", rating=4.0) for _ in range(20)]
    result = detect_biases(
        reviews,
        _analysis(sentiment={"positive": 20, "negative": 80, "neutral": 0}),
    )
    neg_signal = next(s for s in result["signals"] if s["bias_type"] == "negativity_bias")
    assert neg_signal["detected"] is True
    assert neg_signal["strength"] in ("high", "medium")


def test_negativity_bias_not_detected_at_low_neg_ratio():
    reviews = [_review(rating=4.0) for _ in range(20)]
    result = detect_biases(
        reviews,
        _analysis(sentiment={"positive": 12, "negative": 5, "neutral": 3}),
    )
    neg_signal = next(s for s in result["signals"] if s["bias_type"] == "negativity_bias")
    assert neg_signal["detected"] is False


# ── One-Star Dominance ───────────────────────────────────────────────────────

def test_one_star_dominance_detected():
    reviews = [_review(rating=1.0) for _ in range(80)] + \
              [_review(rating=5.0) for _ in range(20)]
    result = detect_biases(
        reviews,
        _analysis(ratings={"1": 80, "2": 0, "3": 0, "4": 0, "5": 20}),
    )
    signal = next(s for s in result["signals"] if s["bias_type"] == "one_star_dominance")
    assert signal["detected"] is True
    assert signal["strength"] in ("high", "medium")  # 80% is at the boundary


# ── Marketplace Variability ──────────────────────────────────────────────────

def test_marketplace_variability_detected_bimodal():
    reviews = [_review(rating=1.0) for _ in range(40)] + \
              [_review(rating=5.0) for _ in range(40)] + \
              [_review(rating=3.0) for _ in range(20)]
    result = detect_biases(
        reviews,
        _analysis(ratings={"1": 40, "2": 0, "3": 20, "4": 0, "5": 40}),
    )
    signal = next(s for s in result["signals"] if s["bias_type"] == "marketplace_variability")
    assert signal["detected"] is True


# ── Scale Effect ─────────────────────────────────────────────────────────────

def test_scale_effect_detected_high_volume():
    reviews = [_review(rating=1.0) for _ in range(50)] + \
              [_review(rating=5.0) for _ in range(100)] + \
              [_review(rating=3.0) for _ in range(50)]
    result = detect_biases(
        reviews,
        _analysis(sentiment={"positive": 100, "negative": 50, "neutral": 50}),
    )
    signal = next(s for s in result["signals"] if s["bias_type"] == "scale_effect")
    assert signal["detected"] is True


def test_scale_effect_not_detected_small_volume():
    reviews = [_review(rating=2.0) for _ in range(10)]
    result = detect_biases(
        reviews,
        _analysis(sentiment={"positive": 2, "negative": 6, "neutral": 2}),
    )
    signal = next(s for s in result["signals"] if s["bias_type"] == "scale_effect")
    assert signal["detected"] is False


# ── Rating Context ───────────────────────────────────────────────────────────

def test_rating_context_below_baseline():
    reviews = [_review(rating=1.5) for _ in range(50)]
    result = detect_biases(reviews, _analysis(), platform="trustpilot")
    signal = next(s for s in result["signals"] if s["bias_type"] == "rating_inflation")
    assert signal["detected"] is True
    assert signal["strength"] == "high"  # 1.5 is 2.7 below baseline 4.2


def test_rating_context_near_baseline():
    reviews = [_review(rating=4.1) for _ in range(50)]
    result = detect_biases(reviews, _analysis(), platform="trustpilot")
    signal = next(s for s in result["signals"] if s["bias_type"] == "rating_inflation")
    assert signal["detected"] is False  # 4.1 is within 0.3 of 4.2


# ── Adjusted Rating ──────────────────────────────────────────────────────────

def test_adjusted_rating_higher_than_raw_when_biases_detected():
    """Spotify-like scenario: very low raw rating with multiple biases."""
    reviews = [_review(body="Worst app ever", rating=1.0) for _ in range(160)] + \
              [_review(body="Love it", rating=5.0) for _ in range(40)]
    result = detect_biases(
        reviews,
        _analysis(
            sentiment={"positive": 40, "negative": 160, "neutral": 0},
            ratings={"1": 150, "2": 5, "3": 5, "4": 10, "5": 30},
        ),
        platform="trustpilot",
    )
    assert result["adjusted_rating"] > result["raw_rating"]
    assert result["rating_adjustment"] > 0
    assert len(result["adjustment_reasons"]) > 0


def test_adjusted_rating_capped_at_2_5():
    """Even extreme bias shouldn't adjust more than +2.5."""
    reviews = [_review(body="Hate it", rating=1.0) for _ in range(200)]
    result = detect_biases(
        reviews,
        _analysis(
            sentiment={"positive": 0, "negative": 200, "neutral": 0},
            ratings={"1": 200, "2": 0, "3": 0, "4": 0, "5": 0},
        ),
        platform="trustpilot",
    )
    assert result["rating_adjustment"] <= 2.5


# ── Power User Criticism ────────────────────────────────────────────────────

def test_power_user_criticism_detected():
    reviews = [_review(rating=4.0, reviewer_name=f"user{i}") for i in range(20)] + \
              [_review(rating=1.0, reviewer_name="frequent_reviewer") for _ in range(5)]
    result = detect_biases(reviews, _analysis())
    signal = next(s for s in result["signals"] if s["bias_type"] == "power_user_criticism")
    assert signal["detected"] is True


# ── Expectation Gap ──────────────────────────────────────────────────────────

def test_expectation_gap_detected():
    gap_reviews = [_review(body="Expected better quality, very disappointed", rating=2.0) for _ in range(10)]
    ok_reviews = [_review(body="Works fine for me", rating=4.0) for _ in range(20)]
    reviews = gap_reviews + ok_reviews
    result = detect_biases(reviews, _analysis())
    signal = next(s for s in result["signals"] if s["bias_type"] == "expectation_gap")
    assert signal["detected"] is True
