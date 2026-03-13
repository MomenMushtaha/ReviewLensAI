import pytest

from app.pipeline.analyzer import _vader_sentiment, _cluster_themes


# ─── Sentiment ────────────────────────────────────────────────────────────────

def test_sentiment_positive_text():
    assert _vader_sentiment("This product is amazing and wonderful!", None) == "positive"


def test_sentiment_negative_text():
    assert _vader_sentiment("Terrible, awful, worst product ever.", None) == "negative"


def test_sentiment_neutral_text():
    assert _vader_sentiment("The product exists.", None) == "neutral"


def test_sentiment_rating_override_positive():
    # Even if text is neutral, very high rating overrides
    assert _vader_sentiment("It works.", 5.0) == "positive"


def test_sentiment_rating_override_negative():
    # Even if text is positive-ish, very low rating overrides
    assert _vader_sentiment("Okay I guess.", 1.0) == "negative"


def test_sentiment_moderate_rating_no_override():
    # Rating 3.0 should NOT override — let VADER decide
    result = _vader_sentiment("This product is amazing and wonderful!", 3.0)
    assert result == "positive"  # VADER decides based on text


# ─── Theme clustering ────────────────────────────────────────────────────────

def test_cluster_themes_insufficient_data():
    labels, kws = _cluster_themes(["short", "text"])
    assert labels == [0, 0]
    assert kws == [["insufficient data"]]


def test_cluster_themes_basic():
    bodies = [
        "The shipping was fast and delivery was quick",
        "Delivery speed was excellent and shipping was reliable",
        "The product quality is great and well made",
        "High quality materials and excellent build",
        "Quality craftsmanship and durable materials",
        "Fast shipping and quick delivery time",
        "Well built product with good materials",
    ]
    labels, kws = _cluster_themes(bodies, n_max=3)
    assert len(labels) == 7
    assert all(isinstance(l, int) for l in labels)
    assert len(kws) >= 2  # At least 2 clusters
    # Each cluster should have keywords
    for cluster_kws in kws:
        assert len(cluster_kws) > 0


def test_cluster_themes_returns_correct_count():
    # With diverse text, should produce multiple clusters
    bodies = [
        "The shipping was very fast and arrived on time",
        "Delivery was quick and the package was intact",
        "Shipping speed exceeded my expectations",
        "The product quality is outstanding and durable",
        "High quality build with premium materials",
        "Customer service was helpful and responsive",
        "The support team resolved my issue quickly",
        "Great value for the affordable price point",
        "Best bang for the buck product available",
        "Easy to use interface and simple setup",
    ]
    labels, kws = _cluster_themes(bodies)
    n_clusters = len(set(labels))
    assert 2 <= n_clusters <= 8
    assert len(kws) == n_clusters
