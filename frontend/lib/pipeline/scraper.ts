import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

export interface RawReview {
  sourceUrl: string;
  platform: string;
  externalId?: string;
  reviewerName?: string;
  rating?: number;
  title?: string;
  body: string;
  date?: Date;
  verified?: boolean;
}

export interface ScrapeResult {
  reviews: RawReview[];
  productName: string | null;
  totalReviews: number | null;
}

export class ScraperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScraperError';
  }
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Column name mappings for CSV import
const BODY_COLS = new Set(['body', 'text', 'review', 'content', 'review_text', 'comment']);
const RATING_COLS = new Set(['rating', 'score', 'stars', 'star_rating', 'rate']);
const DATE_COLS = new Set(['date', 'created_at', 'timestamp', 'review_date', 'published_at']);
const NAME_COLS = new Set(['reviewer', 'author', 'name', 'username', 'reviewer_name', 'user']);
const TITLE_COLS = new Set(['title', 'subject', 'headline', 'review_title']);

function parseTrustpilotPage(html: string, sourceUrl: string): RawReview[] {
  const $ = cheerio.load(html);
  
  // Primary: __NEXT_DATA__
  const nextDataScript = $('#__NEXT_DATA__').html();
  if (nextDataScript) {
    try {
      const data = JSON.parse(nextDataScript);
      const reviewsRaw = data?.props?.pageProps?.reviews || [];
      if (reviewsRaw.length > 0) {
        return reviewsRaw.map((r: any) => mapTrustpilotReview(r, sourceUrl));
      }
    } catch (e) {
      // Fall through to JSON-LD
    }
  }

  // Fallback: JSON-LD
  const reviews: RawReview[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const blob = JSON.parse($(el).html() || '');
      const items = Array.isArray(blob) ? blob : [blob];
      for (const item of items) {
        if (item['@type'] === 'Review') {
          reviews.push(mapJsonLdReview(item, sourceUrl));
        } else if (['LocalBusiness', 'Organization'].includes(item['@type'])) {
          for (const r of item.review || []) {
            reviews.push(mapJsonLdReview(r, sourceUrl));
          }
        }
      }
    } catch (e) {
      // Skip invalid JSON
    }
  });

  return reviews;
}

function mapTrustpilotReview(raw: any, sourceUrl: string): RawReview {
  const dates = raw.dates || {};
  const dateStr = dates.publishedDate || dates.experiencedDate;
  let date: Date | undefined;
  if (dateStr) {
    try {
      date = new Date(dateStr);
    } catch (e) {}
  }

  const consumer = raw.consumer || {};
  return {
    sourceUrl,
    platform: 'trustpilot',
    externalId: String(raw.id || ''),
    reviewerName: consumer.displayName,
    rating: raw.rating != null ? Number(raw.rating) : undefined,
    title: raw.title,
    body: raw.text || '',
    date,
    verified: raw.isVerified || false,
  };
}

function mapJsonLdReview(raw: any, sourceUrl: string): RawReview {
  let date: Date | undefined;
  if (raw.datePublished) {
    try {
      date = new Date(raw.datePublished);
    } catch (e) {}
  }

  let rating: number | undefined;
  const ratingObj = raw.reviewRating || {};
  if (ratingObj.ratingValue) {
    try {
      rating = Number(ratingObj.ratingValue);
    } catch (e) {}
  }

  const author = raw.author || {};
  const name = typeof author === 'object' ? author.name : String(author);

  return {
    sourceUrl,
    platform: 'trustpilot',
    reviewerName: name,
    rating,
    title: raw.name,
    body: raw.reviewBody || '',
    date,
  };
}

function extractProductName(html: string): string | null {
  const $ = cheerio.load(html);
  const nextDataScript = $('#__NEXT_DATA__').html();
  if (nextDataScript) {
    try {
      const data = JSON.parse(nextDataScript);
      const biz = data?.props?.pageProps?.businessUnit || {};
      return biz.displayName || biz.identifyingName || null;
    } catch (e) {}
  }
  const h1 = $('h1').first().text()?.trim();
  return h1 || null;
}

function extractTotalReviews(html: string): number | null {
  const $ = cheerio.load(html);
  const nextDataScript = $('#__NEXT_DATA__').html();
  if (nextDataScript) {
    try {
      const data = JSON.parse(nextDataScript);
      const count = data?.props?.pageProps?.businessUnit?.numberOfReviews?.total;
      if (count) return Number(count);
    } catch (e) {}
  }
  return null;
}

async function fetchPage(url: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
      });
      
      if (response.status === 429 || response.status >= 500) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      
      if (!response.ok) {
        throw new ScraperError(`HTTP ${response.status} fetching ${url}`);
      }
      
      return await response.text();
    } catch (e) {
      if (attempt === retries - 1) {
        throw new ScraperError(`Failed to fetch ${url}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new ScraperError(`Failed to fetch ${url} after ${retries} attempts`);
}

export async function scrapeTrustpilot(
  url: string,
  progressCb?: (stage: string, percent: number, message: string) => Promise<void>,
  maxPages = 10,
  concurrency = 3
): Promise<ScrapeResult> {
  // Normalize URL - support various Trustpilot domains (www., ca., uk., etc.)
  const baseUrl = url.replace(/\?.*$/, '').replace(/\/$/, '');
  const trustpilotPattern = /^https?:\/\/(www\.|[a-z]{2}\.)?trustpilot\.com\/review\//i;
  if (!trustpilotPattern.test(baseUrl)) {
    throw new ScraperError(
      'URL must be a Trustpilot review page (e.g. https://www.trustpilot.com/review/netflix.com)'
    );
  }

  const allReviews: RawReview[] = [];

  // Fetch page 1
  if (progressCb) await progressCb('scraping', 5, 'Fetching page 1...');
  const page1Html = await fetchPage(`${baseUrl}?page=1`);
  const productName = extractProductName(page1Html);
  const totalReviews = extractTotalReviews(page1Html);
  const page1Reviews = parseTrustpilotPage(page1Html, baseUrl);
  allReviews.push(...page1Reviews);

  const perPage = page1Reviews.length || 20;
  const totalPages = Math.min(maxPages, totalReviews ? Math.ceil(totalReviews / perPage) : maxPages);

  if (progressCb) {
    await progressCb('scraping', 15, `Found ~${totalReviews || '?'} reviews, fetching up to ${totalPages} pages...`);
  }

  // Fetch remaining pages in batches
  for (let batchStart = 2; batchStart <= totalPages; batchStart += concurrency) {
    const batch = Array.from(
      { length: Math.min(concurrency, totalPages - batchStart + 1) },
      (_, i) => batchStart + i
    );

    const results = await Promise.allSettled(
      batch.map(page => fetchPage(`${baseUrl}?page=${page}`).then(html => parseTrustpilotPage(html, baseUrl)))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allReviews.push(...result.value);
      }
    }

    // Polite delay between batches
    await new Promise(r => setTimeout(r, 1000));

    if (progressCb) {
      const pct = Math.min(90, Math.floor((allReviews.length / Math.max(totalReviews || perPage * totalPages, 1)) * 90));
      await progressCb('scraping', pct, `Scraped ${allReviews.length} reviews so far...`);
    }
  }

  // Filter out empty reviews
  const validReviews = allReviews.filter(r => r.body && r.body.trim());

  if (progressCb) {
    await progressCb('scraping', 100, `Scraped ${validReviews.length} reviews from Trustpilot`);
  }

  return { reviews: validReviews, productName, totalReviews };
}

function findColumn(columns: string[], candidates: Set<string>): string | null {
  for (const col of columns) {
    if (candidates.has(col.toLowerCase().trim())) {
      return col;
    }
  }
  return null;
}

export function parseCSV(csvText: string, sourceUrl = 'csv://upload'): RawReview[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new ScraperError('CSV must have at least a header and one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  const bodyCol = findColumn(headers, BODY_COLS);
  if (!bodyCol) {
    throw new ScraperError(
      `CSV must have a body column. Recognized names: ${Array.from(BODY_COLS).sort().join(', ')}. Found: ${headers.join(', ')}`
    );
  }

  const ratingCol = findColumn(headers, RATING_COLS);
  const dateCol = findColumn(headers, DATE_COLS);
  const nameCol = findColumn(headers, NAME_COLS);
  const titleCol = findColumn(headers, TITLE_COLS);

  const bodyIdx = headers.indexOf(bodyCol);
  const ratingIdx = ratingCol ? headers.indexOf(ratingCol) : -1;
  const dateIdx = dateCol ? headers.indexOf(dateCol) : -1;
  const nameIdx = nameCol ? headers.indexOf(nameCol) : -1;
  const titleIdx = titleCol ? headers.indexOf(titleCol) : -1;

  const reviews: RawReview[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
    const body = row[bodyIdx]?.trim();
    
    if (!body || body.toLowerCase() === 'nan') continue;

    let rating: number | undefined;
    if (ratingIdx >= 0 && row[ratingIdx]) {
      const parsed = parseFloat(row[ratingIdx]);
      if (!isNaN(parsed)) rating = parsed;
    }

    let date: Date | undefined;
    if (dateIdx >= 0 && row[dateIdx]) {
      try {
        date = new Date(row[dateIdx]);
        if (isNaN(date.getTime())) date = undefined;
      } catch (e) {}
    }

    reviews.push({
      sourceUrl,
      platform: 'csv',
      reviewerName: nameIdx >= 0 ? row[nameIdx] : undefined,
      rating,
      title: titleIdx >= 0 ? row[titleIdx] : undefined,
      body,
      date,
    });
  }

  if (reviews.length === 0) {
    throw new ScraperError('CSV contained no valid reviews');
  }

  return reviews;
}

export function hashReviewBody(body: string): string {
  return createHash('sha256').update(body.trim().toLowerCase()).digest('hex');
}
