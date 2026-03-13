import json
from datetime import datetime

import pytest

from app.pipeline.scraper import (
    _parse_trustpilot_page,
    _map_trustpilot_review,
    _map_jsonld_review,
    _extract_product_name,
    _extract_total_reviews,
    parse_csv,
    ScraperError,
)


# ─── __NEXT_DATA__ parsing ───────────────────────────────────────────────────

def _make_next_data_html(reviews: list[dict], business_unit: dict | None = None) -> str:
    data = {
        "props": {
            "pageProps": {
                "reviews": reviews,
                "businessUnit": business_unit or {
                    "displayName": "TestCorp",
                    "numberOfReviews": {"total": len(reviews)},
                },
            }
        }
    }
    return f'<html><script id="__NEXT_DATA__" type="application/json">{json.dumps(data)}</script></html>'


def test_parse_trustpilot_next_data_basic():
    html = _make_next_data_html([
        {
            "id": "r1",
            "text": "Great product!",
            "rating": 5,
            "title": "Love it",
            "dates": {"publishedDate": "2024-01-15T12:00:00Z"},
            "consumer": {"displayName": "Alice"},
            "isVerified": True,
        }
    ])
    reviews = _parse_trustpilot_page(html, "https://www.trustpilot.com/review/test.com")
    assert len(reviews) == 1
    r = reviews[0]
    assert r.body == "Great product!"
    assert r.rating == 5.0
    assert r.reviewer_name == "Alice"
    assert r.verified is True
    assert r.platform == "trustpilot"
    assert r.title == "Love it"


def test_parse_trustpilot_next_data_empty_reviews():
    html = _make_next_data_html([])
    reviews = _parse_trustpilot_page(html, "https://www.trustpilot.com/review/test.com")
    assert reviews == []


def test_extract_product_name():
    html = _make_next_data_html([], {"displayName": "Netflix", "numberOfReviews": {"total": 100}})
    assert _extract_product_name(html) == "Netflix"


def test_extract_total_reviews():
    html = _make_next_data_html([], {"displayName": "Foo", "numberOfReviews": {"total": 42}})
    assert _extract_total_reviews(html) == 42


# ─── JSON-LD fallback ────────────────────────────────────────────────────────

def test_parse_trustpilot_jsonld_fallback():
    jsonld = {
        "@type": "Review",
        "reviewBody": "Decent service",
        "reviewRating": {"ratingValue": "4"},
        "author": {"name": "Bob"},
        "datePublished": "2024-03-01",
    }
    html = f'<html><script type="application/ld+json">{json.dumps(jsonld)}</script></html>'
    reviews = _parse_trustpilot_page(html, "https://www.trustpilot.com/review/test.com")
    assert len(reviews) == 1
    assert reviews[0].body == "Decent service"
    assert reviews[0].rating == 4.0
    assert reviews[0].reviewer_name == "Bob"


def test_parse_trustpilot_jsonld_wrapped_in_org():
    jsonld = {
        "@type": "Organization",
        "review": [
            {"@type": "Review", "reviewBody": "A", "reviewRating": {"ratingValue": "3"}, "author": {"name": "C"}},
        ],
    }
    html = f'<html><script type="application/ld+json">{json.dumps(jsonld)}</script></html>'
    reviews = _parse_trustpilot_page(html, "https://www.trustpilot.com/review/test.com")
    assert len(reviews) == 1
    assert reviews[0].body == "A"


# ─── _map_trustpilot_review ──────────────────────────────────────────────────

def test_map_trustpilot_review_missing_date():
    r = _map_trustpilot_review(
        {"text": "No date here", "rating": 3, "consumer": {}, "dates": {}},
        "http://example.com",
    )
    assert r.date is None
    assert r.body == "No date here"


def test_map_trustpilot_review_missing_rating():
    r = _map_trustpilot_review(
        {"text": "Text only", "consumer": {"displayName": "X"}, "dates": {}},
        "http://example.com",
    )
    assert r.rating is None


# ─── CSV parsing ─────────────────────────────────────────────────────────────

def test_parse_csv_basic():
    csv = b"body,rating,reviewer\nGreat!,5,Alice\nBad,1,Bob\n"
    reviews = parse_csv(csv)
    assert len(reviews) == 2
    assert reviews[0].body == "Great!"
    assert reviews[0].rating == 5.0
    assert reviews[0].reviewer_name == "Alice"
    assert reviews[0].platform == "csv"


def test_parse_csv_flexible_column_names():
    csv = b"review_text,stars,author\nNice,4,Carol\n"
    reviews = parse_csv(csv)
    assert len(reviews) == 1
    assert reviews[0].body == "Nice"
    assert reviews[0].rating == 4.0
    assert reviews[0].reviewer_name == "Carol"


def test_parse_csv_body_only():
    csv = b"text\nJust a review\nAnother one\n"
    reviews = parse_csv(csv)
    assert len(reviews) == 2


def test_parse_csv_missing_body_column():
    csv = b"rating,name\n5,Bob\n"
    with pytest.raises(ScraperError, match="body column"):
        parse_csv(csv)


def test_parse_csv_empty_rows_skipped():
    csv = b"body,rating\nReal review,3\n,5\nnan,2\n"
    reviews = parse_csv(csv)
    assert len(reviews) == 1
    assert reviews[0].body == "Real review"


def test_parse_csv_no_valid_reviews():
    csv = b"body\n\nnan\n"
    with pytest.raises(ScraperError, match="no valid reviews"):
        parse_csv(csv)
