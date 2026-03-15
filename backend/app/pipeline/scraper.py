import asyncio
import json
import logging
import re
from datetime import datetime
from io import BytesIO

import httpx
import pandas as pd
from bs4 import BeautifulSoup

from app.config import settings
from app.schemas.review import RawReview

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

JSON_API_HEADERS = {
    "User-Agent": HEADERS["User-Agent"],
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

JSON_API_PER_PAGE = 5  # Trustpilot JSON API returns 5 reviews per page

# Column name mappings for CSV import
BODY_COLS = {"body", "text", "review", "content", "review_text", "comment"}
RATING_COLS = {"rating", "score", "stars", "star_rating", "rate"}
DATE_COLS = {"date", "created_at", "timestamp", "review_date", "published_at"}
NAME_COLS = {"reviewer", "author", "name", "username", "reviewer_name", "user"}
TITLE_COLS = {"title", "subject", "headline", "review_title"}


class ScraperError(Exception):
    pass


# ─── Trustpilot ───────────────────────────────────────────────────────────────

def _parse_trustpilot_page(html: str, source_url: str) -> list[RawReview]:
    """Extract reviews from a Trustpilot page via __NEXT_DATA__ with JSON-LD fallback."""
    soup = BeautifulSoup(html, "lxml")

    # Primary: __NEXT_DATA__
    next_data_tag = soup.find("script", id="__NEXT_DATA__")
    if next_data_tag:
        try:
            data = json.loads(next_data_tag.string)
            reviews_raw = (
                data.get("props", {})
                    .get("pageProps", {})
                    .get("reviews", [])
            )
            if reviews_raw:
                return [_map_trustpilot_review(r, source_url) for r in reviews_raw]
        except (json.JSONDecodeError, AttributeError):
            pass

    # Fallback: JSON-LD
    reviews = []
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            blob = json.loads(tag.string)
        except (json.JSONDecodeError, AttributeError):
            continue
        items = blob if isinstance(blob, list) else [blob]
        for item in items:
            if item.get("@type") == "Review":
                reviews.append(_map_jsonld_review(item, source_url))
            elif item.get("@type") in ("LocalBusiness", "Organization"):
                for r in item.get("review", []):
                    reviews.append(_map_jsonld_review(r, source_url))

    return reviews


def _map_trustpilot_review(raw: dict, source_url: str) -> RawReview:
    dates = raw.get("dates", {})
    date_str = dates.get("publishedDate") or dates.get("experiencedDate")
    date = None
    if date_str:
        try:
            date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except ValueError:
            pass

    rating_raw = raw.get("rating")
    rating = float(rating_raw) if rating_raw is not None else None

    consumer = raw.get("consumer", {})
    return RawReview(
        source_url=source_url,
        platform="trustpilot",
        external_id=str(raw.get("id", "")),
        reviewer_name=consumer.get("displayName"),
        rating=rating,
        title=raw.get("title"),
        body=raw.get("text", ""),
        date=date,
        verified=raw.get("isVerified", False),
    )


def _map_jsonld_review(raw: dict, source_url: str) -> RawReview:
    date = None
    date_str = raw.get("datePublished")
    if date_str:
        try:
            date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except ValueError:
            pass

    rating = None
    rating_obj = raw.get("reviewRating", {})
    if rating_obj:
        try:
            rating = float(rating_obj.get("ratingValue", 0))
        except (TypeError, ValueError):
            pass

    author = raw.get("author", {})
    name = author.get("name") if isinstance(author, dict) else str(author)

    return RawReview(
        source_url=source_url,
        platform="trustpilot",
        reviewer_name=name,
        rating=rating,
        title=raw.get("name"),
        body=raw.get("reviewBody", ""),
        date=date,
    )


def _extract_product_name(html: str) -> str | None:
    soup = BeautifulSoup(html, "lxml")
    next_data_tag = soup.find("script", id="__NEXT_DATA__")
    if next_data_tag:
        try:
            data = json.loads(next_data_tag.string)
            biz = (
                data.get("props", {})
                    .get("pageProps", {})
                    .get("businessUnit", {})
            )
            return biz.get("displayName") or biz.get("identifyingName")
        except (json.JSONDecodeError, AttributeError):
            pass
    tag = soup.find("h1")
    return tag.get_text(strip=True) if tag else None


def _extract_total_reviews(html: str) -> int | None:
    soup = BeautifulSoup(html, "lxml")
    next_data_tag = soup.find("script", id="__NEXT_DATA__")
    if next_data_tag:
        try:
            data = json.loads(next_data_tag.string)
            num_reviews = (
                data.get("props", {})
                    .get("pageProps", {})
                    .get("businessUnit", {})
                    .get("numberOfReviews")
            )
            if isinstance(num_reviews, int):
                return num_reviews
            if isinstance(num_reviews, dict):
                total = num_reviews.get("total")
                if total:
                    return int(total)
        except (json.JSONDecodeError, TypeError):
            pass
    return None


async def _fetch_page(client: httpx.AsyncClient, url: str, retries: int = 4) -> str:
    last_status = None
    for attempt in range(retries):
        try:
            resp = await client.get(url, headers=HEADERS, timeout=20, follow_redirects=True)
            last_status = resp.status_code
            if resp.status_code in (403, 429) or resp.status_code >= 500:
                delay = 2 ** (attempt + 1)
                logger.warning("HTML fetch %d on %s, retrying in %.1fs", resp.status_code, url, delay)
                await asyncio.sleep(delay)
                continue
            resp.raise_for_status()
            return resp.text
        except httpx.HTTPStatusError as e:
            last_status = e.response.status_code
            if attempt == retries - 1:
                raise ScraperError(f"HTTP {e.response.status_code} fetching {url}") from e
            await asyncio.sleep(2 ** attempt)
        except httpx.RequestError as e:
            if attempt == retries - 1:
                raise ScraperError(f"Request error fetching {url}: {e}") from e
            await asyncio.sleep(2 ** attempt)
    if last_status in (403, 429):
        raise ScraperError(
            "Trustpilot is rate-limiting your IP address. "
            "Please wait a few minutes and try again, or try from a different network."
        )
    raise ScraperError(f"Failed to fetch {url} after {retries} attempts")


def _extract_business_unit_id(html: str) -> str | None:
    """Extract businessUnitId from __NEXT_DATA__ for use with the JSON API."""
    soup = BeautifulSoup(html, "lxml")
    tag = soup.find("script", id="__NEXT_DATA__")
    if not tag:
        return None
    try:
        data = json.loads(tag.string)
        return data["props"]["pageProps"]["businessUnit"]["id"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


def _map_json_api_review(raw: dict, source_url: str) -> RawReview:
    """Map a review from the Trustpilot JSON API format to RawReview."""
    date = None
    date_str = raw.get("dates", {}).get("publishedDate")
    if date_str:
        try:
            date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except ValueError:
            pass

    rating_raw = raw.get("rating")
    rating = float(rating_raw) if rating_raw is not None else None

    consumer = raw.get("consumer", {})
    return RawReview(
        source_url=source_url,
        platform="trustpilot",
        external_id=str(raw.get("id", "")),
        reviewer_name=consumer.get("displayName"),
        rating=rating,
        title=raw.get("title"),
        body=raw.get("text", ""),
        date=date,
        verified=consumer.get("isVerified", False),
    )


async def _fetch_reviews_json(
    client: httpx.AsyncClient,
    business_unit_id: str,
    page: int,
    retries: int = 4,
) -> list[dict]:
    """Fetch a page of reviews from the Trustpilot JSON API."""
    url = (
        f"https://www.trustpilot.com/api/categoriespages/{business_unit_id}/reviews"
        f"?locale=en-US&page={page}"
    )
    for attempt in range(retries):
        try:
            resp = await client.get(url, headers=JSON_API_HEADERS, timeout=20, follow_redirects=True)
            if resp.status_code == 403:
                # Rate limited — treat as retryable
                delay = 2 ** (attempt + 1)
                logger.warning("JSON API 403 on page %d, backing off %.1fs", page, delay)
                await asyncio.sleep(delay)
                continue
            if resp.status_code == 429 or resp.status_code >= 500:
                await asyncio.sleep(2 ** attempt)
                continue
            resp.raise_for_status()
            data = resp.json()
            return data.get("reviews", [])
        except httpx.HTTPStatusError as e:
            if attempt == retries - 1:
                raise ScraperError(f"JSON API HTTP {e.response.status_code} for page {page}") from e
            await asyncio.sleep(2 ** attempt)
        except httpx.RequestError as e:
            if attempt == retries - 1:
                raise ScraperError(f"JSON API request error page {page}: {e}") from e
            await asyncio.sleep(2 ** attempt)
    return []


async def _scrape_json_api(
    client: httpx.AsyncClient,
    business_unit_id: str,
    source_url: str,
    max_reviews: int,
    progress_cb=None,
) -> list[RawReview]:
    """Scrape reviews using Trustpilot's internal JSON API with adaptive pacing."""
    all_reviews: list[RawReview] = []
    page_limit = max_reviews // JSON_API_PER_PAGE + 1
    batch_size = settings.scraper_concurrency
    delay = 0.5
    consecutive_empty = 0
    semaphore = asyncio.Semaphore(batch_size)

    logger.info("JSON API scrape start: unit=%s max_reviews=%d page_limit=%d", business_unit_id, max_reviews, page_limit)

    page = 1
    while page <= page_limit:
        current_batch_size = min(batch_size, page_limit - page + 1)
        pages = list(range(page, page + current_batch_size))

        async def fetch_with_sem(p: int):
            async with semaphore:
                return await _fetch_reviews_json(client, business_unit_id, p)

        results = await asyncio.gather(*[fetch_with_sem(p) for p in pages], return_exceptions=True)

        batch_empty = True
        for result in results:
            if isinstance(result, list) and result:
                batch_empty = False
                for raw in result:
                    all_reviews.append(_map_json_api_review(raw, source_url))

        if batch_empty:
            consecutive_empty += 1
            # Adaptive back-off: slow down and reduce batch size
            delay = min(delay * 1.5, 8.0)
            batch_size = max(batch_size - 1, 1)
            semaphore = asyncio.Semaphore(batch_size)
            logger.debug("Empty batch %d, delay=%.1fs batch_size=%d", consecutive_empty, delay, batch_size)
            if consecutive_empty >= 5:
                logger.info("Stopping after %d consecutive empty batches at page %d", consecutive_empty, page)
                break
        else:
            consecutive_empty = 0
            # Restore speed on success
            if batch_size < settings.scraper_concurrency:
                batch_size = min(batch_size + 1, settings.scraper_concurrency)
                semaphore = asyncio.Semaphore(batch_size)
            if delay > 0.5:
                delay = max(delay * 0.8, 0.5)

        page += current_batch_size

        # Early stop if we have enough
        if len(all_reviews) >= max_reviews:
            break

        await asyncio.sleep(delay)
        if progress_cb:
            pct = min(90, int(len(all_reviews) / max_reviews * 90))
            await progress_cb("scraping", pct, f"Scraped {len(all_reviews)} reviews so far…")

    logger.info("JSON API scrape done: reviews=%d pages_fetched=%d", len(all_reviews), page - 1)
    return all_reviews


async def _scrape_html(
    client: httpx.AsyncClient,
    base_url: str,
    page1_html: str,
    total: int | None,
    progress_cb=None,
) -> list[RawReview]:
    """Original HTML scraper — uses settings.scraper_max_pages to cap pages."""
    all_reviews: list[RawReview] = []
    page1_reviews = _parse_trustpilot_page(page1_html, base_url)
    all_reviews.extend(page1_reviews)

    per_page = len(page1_reviews) or 20
    max_pages = min(
        settings.scraper_max_pages,
        (total // per_page + 1) if total else settings.scraper_max_pages,
    )

    logger.info("HTML scrape: per_page=%d max_pages=%d total=%s", per_page, max_pages, total)
    if progress_cb:
        await progress_cb("scraping", 15, f"Found ~{total or '?'} reviews, fetching up to {max_pages} pages…")

    semaphore = asyncio.Semaphore(settings.scraper_concurrency)

    async def fetch_page_n(page: int) -> list[RawReview]:
        async with semaphore:
            html = await _fetch_page(client, f"{base_url}?page={page}")
            return _parse_trustpilot_page(html, base_url)

    for batch_start in range(2, max_pages + 1, settings.scraper_concurrency):
        batch = range(batch_start, min(batch_start + settings.scraper_concurrency, max_pages + 1))
        results = await asyncio.gather(*[fetch_page_n(p) for p in batch], return_exceptions=True)
        for result in results:
            if isinstance(result, list):
                all_reviews.extend(result)
        await asyncio.sleep(1)  # polite delay between batches
        if progress_cb:
            pct = min(90, int(len(all_reviews) / max(total or per_page * max_pages, 1) * 90))
            await progress_cb("scraping", pct, f"Scraped {len(all_reviews)} reviews so far…")

    return all_reviews


async def scrape_trustpilot(
    url: str,
    max_reviews: int | None = None,
    progress_cb=None,
) -> tuple[list[RawReview], str | None]:
    """
    Scrape reviews from a Trustpilot URL.
    Quick mode (max_reviews <= 200): original HTML scraper using scraper_max_pages.
    Deep mode (max_reviews > 200): JSON API with adaptive pacing.
    Returns (reviews, product_name).
    """
    base_url = re.sub(r"\?.*$", "", url.rstrip("/"))
    if not base_url.startswith("https://www.trustpilot.com/review/"):
        raise ScraperError(
            "URL must be a Trustpilot review page "
            "(e.g. https://www.trustpilot.com/review/netflix.com)"
        )

    effective_max = max_reviews or 200
    all_reviews: list[RawReview] = []
    product_name: str | None = None

    async with httpx.AsyncClient() as client:
        if progress_cb:
            await progress_cb("scraping", 5, "Fetching page 1…")
        page1_html = await _fetch_page(client, f"{base_url}?page=1")
        product_name = _extract_product_name(page1_html)
        total = _extract_total_reviews(page1_html)

        if effective_max > 200:
            # ── Deep mode: JSON API ──────────────────────────────────────
            business_unit_id = _extract_business_unit_id(page1_html)
            if business_unit_id:
                logger.info("Deep mode: JSON API (unit=%s, target=%d)", business_unit_id, effective_max)
                if progress_cb:
                    await progress_cb("scraping", 10, f"Found ~{total or '?'} reviews, deep scrape for up to {effective_max}…")
                all_reviews = await _scrape_json_api(client, business_unit_id, base_url, effective_max, progress_cb)
            else:
                logger.warning("No businessUnitId found, falling back to HTML scraper")
                all_reviews = await _scrape_html(client, base_url, page1_html, total, progress_cb)
        else:
            # ── Quick mode: original HTML scraper ────────────────────────
            all_reviews = await _scrape_html(client, base_url, page1_html, total, progress_cb)

    # Filter empty bodies and enforce cap
    all_reviews = [r for r in all_reviews if r.body and r.body.strip()]
    if effective_max and len(all_reviews) > effective_max:
        all_reviews = all_reviews[:effective_max]
    if progress_cb:
        await progress_cb("scraping", 100, f"Scraped {len(all_reviews)} reviews from Trustpilot")

    logger.info("Scraping complete: reviews=%d mode=%s", len(all_reviews), "deep" if effective_max > 200 else "quick")
    return all_reviews, product_name


# ─── CSV ──────────────────────────────────────────────────────────────────────

def _find_col(df_cols: list[str], candidates: set[str]) -> str | None:
    for col in df_cols:
        if col.lower().strip() in candidates:
            return col
    return None


def parse_csv(csv_bytes: bytes, source_url: str = "csv://upload") -> list[RawReview]:
    try:
        df = pd.read_csv(BytesIO(csv_bytes))
    except Exception as e:
        raise ScraperError(f"Failed to parse CSV: {e}") from e

    cols = list(df.columns)
    body_col = _find_col(cols, BODY_COLS)
    if not body_col:
        raise ScraperError(
            f"CSV must have a body column. Recognised names: {sorted(BODY_COLS)}. "
            f"Found: {cols}"
        )

    rating_col = _find_col(cols, RATING_COLS)
    date_col = _find_col(cols, DATE_COLS)
    name_col = _find_col(cols, NAME_COLS)
    title_col = _find_col(cols, TITLE_COLS)

    reviews = []
    for _, row in df.iterrows():
        body = str(row[body_col]).strip()
        if not body or body.lower() == "nan":
            continue

        rating = None
        if rating_col:
            try:
                rating = float(row[rating_col])
            except (ValueError, TypeError):
                pass

        date = None
        if date_col:
            try:
                date = pd.to_datetime(row[date_col]).to_pydatetime()
            except Exception:
                pass

        reviews.append(RawReview(
            source_url=source_url,
            platform="csv",
            reviewer_name=str(row[name_col]).strip() if name_col and pd.notna(row[name_col]) else None,
            rating=rating,
            title=str(row[title_col]).strip() if title_col and pd.notna(row[title_col]) else None,
            body=body,
            date=date,
        ))

    if not reviews:
        raise ScraperError("CSV contained no valid reviews")

    return reviews
