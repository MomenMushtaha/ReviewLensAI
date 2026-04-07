# Claude Code Session — 2026-03-15
## Quick vs Deep Analysis Mode + Scraper Improvements

---

### Session Summary

Added a **Quick / Deep analysis mode toggle** to the frontend and dual-mode scraping to the backend. Quick mode (~200 reviews) uses the original HTML scraper from the initial build; Deep mode (~2,000 reviews) uses Trustpilot's internal JSON API with adaptive pacing.

---

### Changes Made

#### 1. Frontend — Quick/Deep Toggle (`frontend/components/UrlInputForm.tsx`)
- Added `AnalysisMode` type (`"quick" | "deep"`) and `mode` state defaulting to `"quick"`
- Rendered a segmented control (matching existing tab style) below the URL input, only visible when `tab === "url"`
- Quick label: "Quick ~200 reviews" — Deep label: "Deep ~2,000 experimental"
- Appends `formData.append("max_reviews", mode === "quick" ? "200" : "2000")` before submitting
- `onPipelineStarted` callback now passes mode to the parent

#### 2. Frontend — Mode-aware loading (`frontend/app/page.tsx`)
- Quick mode: navigates to `/project/{id}?loading=true` (original loading behavior)
- Deep mode: adds project to `activePipelines` Set for inline progress on the homepage
- `AnalysisItem` component shows real-time SSE progress (stage pills, progress bar) for deep mode

#### 3. Frontend — AnalysisItem component (`frontend/components/AnalysisItem.tsx`)
- New component extracted for the "Recent Analyses" list
- Uses `usePipelineSSE` hook for real-time pipeline progress
- Shows pulsing dot, stage message, progress bar, and stage pills (scraping, ingesting, analyzing, summarizing)
- Handles completion (navigate to results) and error states
- Delete button with confirmation dialog

#### 4. Frontend — Font migration (`frontend/app/layout.tsx`)
- Switched from local `.woff` font files to `next/font/google` with Inter + JetBrains Mono
- Removed deleted `GeistVF.woff` and `GeistMonoVF.woff` files

#### 5. Backend — Dual-mode scraper (`backend/app/pipeline/scraper.py`)
- **Quick mode (max_reviews <= 200)**: Uses original HTML scraper via `_scrape_html()`
  - Parses `__NEXT_DATA__` from Trustpilot pages (~20 reviews/page)
  - Respects `settings.scraper_max_pages` (default 10 = ~200 reviews)
- **Deep mode (max_reviews > 200)**: Uses JSON API via `_scrape_json_api()`
  - Extracts `businessUnitId` from `__NEXT_DATA__`
  - Fetches from `https://www.trustpilot.com/api/categoriespages/{id}/reviews`
  - 5 reviews per page, adaptive pacing (batch size + delay adjustments)
  - Stops after 5 consecutive empty batches
- Added retry logic with exponential backoff on 403/429 responses
- User-friendly error message when IP is rate-limited by Trustpilot
- Added `_extract_business_unit_id()` and `_map_json_api_review()` helpers
- Added logging throughout for debugging

#### 6. Backend — Pipeline threading
- `backend/app/routers/pipeline.py`: Already accepts `max_reviews: int = Form(200)`, passes to orchestrator
- `backend/app/pipeline/orchestrator.py`: Forwards `max_reviews` to `scrape_trustpilot()`

#### 7. Backend — Environment fix (`backend/.env`)
- Fixed `EMBEDDING_MODEL` from `all-MiniLM-L6-v2` (old sentence-transformers model) to `text-embedding-3-small` (OpenAI model)
- This was causing quick analysis failures since the OpenAI API doesn't recognize the old model name

---

### Key Decisions
- Quick mode uses the **exact same HTML scraper** from the initial build (commit 5474ee2) — no JSON API, no `max_reviews` math, just `settings.scraper_max_pages`
- Deep mode is marked as **experimental** in the UI label
- Quick mode navigates away to the project page (old UX); Deep mode shows inline progress on the homepage
- Rate-limit errors surface as user-friendly messages rather than raw HTTP errors

### Bugs Fixed
- Quick mode was initially routing through the JSON API scraper and fetching 900+ reviews — fixed by using the old HTML scraper
- Embedding model mismatch in `.env` was causing all analyses to fail at the ingestion stage
- Added 403/429 retry logic to prevent immediate failure on Trustpilot rate limiting
- Fixed `_extract_total_reviews()` to handle `numberOfReviews` as both `int` and `dict` formats

### Files Modified
- `frontend/components/UrlInputForm.tsx` — mode toggle + FormData append
- `frontend/app/page.tsx` — quick vs deep routing logic
- `frontend/components/AnalysisItem.tsx` — new inline progress component
- `frontend/app/layout.tsx` — font migration to next/font/google
- `frontend/package.json` / `frontend/package-lock.json` — dependency updates
- `backend/app/pipeline/scraper.py` — dual-mode scraper with JSON API support
- `backend/app/pipeline/orchestrator.py` — max_reviews parameter threading
- `backend/app/pipeline/ingester.py` — unchanged but tracked
- `backend/app/pipeline/analyzer.py` — unchanged but tracked
- `backend/app/pipeline/summarizer.py` — unchanged but tracked
- `backend/app/routers/pipeline.py` — max_reviews form parameter
- `backend/.env` — embedding model fix
- `frontend/app/fonts/GeistMonoVF.woff` — deleted
- `frontend/app/fonts/GeistVF.woff` — deleted
