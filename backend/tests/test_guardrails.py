import pytest

from app.agents.guardrails import pre_filter, post_validate, GuardrailResult, SAFE_FALLBACK


# ─── Pre-filter ──────────────────────────────────────────────────────────────

def test_pre_filter_allows_relevant_question():
    result = pre_filter("What are the most common complaints?", has_relevant_chunks=True)
    assert result.allowed is True
    assert result.category is None


def test_pre_filter_rejects_off_topic_competitor():
    result = pre_filter("How does this compare to Amazon?", has_relevant_chunks=True)
    assert result.allowed is False
    assert result.category == "off_topic"


def test_pre_filter_rejects_off_topic_weather():
    result = pre_filter("What's the weather like today?", has_relevant_chunks=True)
    assert result.allowed is False
    assert result.category == "off_topic"


def test_pre_filter_rejects_off_topic_stock():
    result = pre_filter("What is the stock price of this company?", has_relevant_chunks=True)
    assert result.allowed is False
    assert result.category == "off_topic"


def test_pre_filter_rejects_no_relevant_chunks():
    result = pre_filter("Something about reviews", has_relevant_chunks=False)
    assert result.allowed is False
    assert result.category == "no_relevant_reviews"


def test_pre_filter_off_topic_takes_priority_over_no_chunks():
    # Off-topic pattern should trigger even without chunks
    result = pre_filter("Tell me about Google reviews", has_relevant_chunks=False)
    assert result.allowed is False
    assert result.category == "off_topic"


def test_pre_filter_vs_pattern():
    result = pre_filter("How does this vs. competitor?", has_relevant_chunks=True)
    assert result.allowed is False
    assert result.category == "off_topic"


def test_pre_filter_versus_pattern():
    result = pre_filter("This product versus others", has_relevant_chunks=True)
    assert result.allowed is False
    assert result.category == "off_topic"


def test_pre_filter_about_yourself():
    result = pre_filter("Tell me about yourself", has_relevant_chunks=True)
    assert result.allowed is False
    assert result.category == "off_topic"


# ─── Post-validate ───────────────────────────────────────────────────────────

def test_post_validate_clean_response():
    result = post_validate(
        "Based on the reviews, users mention fast shipping frequently.",
        ["Great product with fast shipping", "Shipping was quick"],
    )
    assert result.allowed is True


def test_post_validate_hallucination_generally_speaking():
    result = post_validate(
        "Generally speaking, products in this category tend to be good.",
        ["The product works fine"],
    )
    assert result.allowed is False
    assert result.category == "hallucination_detected"


def test_post_validate_hallucination_typically():
    result = post_validate(
        "Typically, this type of product has issues with durability.",
        ["The product works fine"],
    )
    assert result.allowed is False
    assert result.category == "hallucination_detected"


def test_post_validate_hallucination_research_shows():
    result = post_validate(
        "Research shows that most customers prefer this type of product.",
        ["I like it"],
    )
    assert result.allowed is False
    assert result.category == "hallucination_detected"


def test_post_validate_external_url():
    result = post_validate(
        "You can find more info at https://malicious.example.com/info",
        ["The product is great"],
    )
    assert result.allowed is False
    assert result.category == "hallucination_detected"


def test_post_validate_url_from_source_allowed():
    result = post_validate(
        "As mentioned in https://trustpilot.com/review/test the product is good.",
        ["See https://trustpilot.com/review/test for details. Product is good."],
    )
    assert result.allowed is True


def test_post_validate_case_insensitive():
    result = post_validate(
        "Based On My Knowledge, this is a good product.",
        ["The product works"],
    )
    assert result.allowed is False
    assert result.category == "hallucination_detected"
