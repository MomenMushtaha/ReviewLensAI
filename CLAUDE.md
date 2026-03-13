# ReviewLens AI — Claude Rules

## Project Overview
Review Intelligence Portal for the take-home assignment. Pipeline: Scraper → Ingester → Analyzer → Summarizer → AI Agent with Guardrails.

---

## Hard Constraints

### Cost
- **Zero financial cost.** Use free tiers only. Never introduce a paid service, API, or dependency.
- Free-tier services in use: Render (backend), Vercel (frontend), Anthropic API (haiku model).

### Auth
- **No user authentication.** The app must be directly accessible via URL with no login.

### Deployment targets
- Backend → Render free tier (Docker, persistent disk at `/app/data`)
- Frontend → Vercel free tier (Next.js zero-config)

---

## Tech Stack — Do Not Deviate Without Discussion

| Layer | Choice |
|---|---|
| Backend | Python 3.11 + FastAPI |
| Frontend | Next.js 14 (App Router) |
| Database | SQLite via SQLAlchemy + aiosqlite |
| Vector store | ChromaDB (persistent, local at `data/chroma/`) |
| Embeddings | `sentence-transformers` — model `all-MiniLM-L6-v2` |
| AI model | `claude-haiku-4-5` (default); `claude-sonnet-4-6` via `CLAUDE_MODEL` env |
| HTTP client | `httpx[http2]` |
| HTML parsing | `beautifulsoup4` + `lxml` |
| Sentiment | VADER (`vaderSentiment`) — **not** a transformer model |
| Theme clustering | `scikit-learn` TF-IDF + KMeans |
| Task progress | Server-Sent Events (SSE) — **not** WebSockets |
| Frontend charts | `recharts` |
| Frontend UI | `shadcn/ui` (via `@radix-ui/*`) + Tailwind CSS |

---

## Scraper Rules

- **Primary target: Trustpilot.** URL pattern: `https://www.trustpilot.com/review/{domain}?page=N`
- **Extract via `__NEXT_DATA__`** — parse `<script id="__NEXT_DATA__" type="application/json">` and read `props.pageProps.reviews[]`. This is pure JSON; do not use CSS selectors for Trustpilot.
- **Fallback extraction: JSON-LD** — parse `<script type="application/ld+json">` blocks with `@type: "Review"`.
- **CSV upload is always the second fallback.** Must support flexible column name mapping.
- Cap scraping at 10 pages (`SCRAPER_MAX_PAGES` env var).
- Always set Chrome `User-Agent` + `Accept-Language: en-US` headers.
- Never scrape aggressively — use a semaphore (max 3 concurrent) and 1s delay between batches.
- Exponential backoff on 429/503.

---

## AI / Claude API Rules

- Use `anthropic` Python SDK.
- The **Summarizer must use tool use (function calling)** with a `produce_summary` tool — never parse free-form JSON from Claude responses.
- Token budget for Summarizer: sample max 30 reviews, truncate each to 300 chars, `max_tokens=1500`.
- Use `tenacity` for retries (3 attempts, exponential backoff starting at 2s).
- Default model: `claude-haiku-4-5`. Never hardcode `claude-sonnet-4-6` — read from `CLAUDE_MODEL` env.

---

## Guardrail Rules (AI Agent)

The chat agent must enforce three layers — do not simplify to fewer:

1. **Pre-filter:** Regex check for off-topic patterns + ChromaDB similarity threshold (`SIMILARITY_THRESHOLD=0.20`). Reject before calling Claude if triggered.
2. **System prompt enforcement:** Scope-locked system prompt injected with retrieved review context, product name, platform, and date range. Claude must explicitly decline out-of-scope questions.
3. **Post-response validator:** Scan Claude's output for hallucination markers (`"generally speaking"`, `"typically"`, external URLs). Replace with safe fallback if triggered.

All rejections must return `guardrail_triggered: true` and a `guardrail_category`.

---

## Data / Storage Rules

- SQLite file lives at `{DATA_DIR}/reviews.db` (env: `DATA_DIR=/app/data`).
- ChromaDB persistent client points to `{DATA_DIR}/chroma/`.
- The `data/` directory is **gitignored** (except `.gitkeep`). Never commit database files.
- Alembic migration runs automatically on FastAPI startup (`alembic upgrade head` in lifespan).
- One ChromaDB collection per project: `reviews_{project_id}`.
- Deduplication via SHA-256 hash of `(source_url + body[:200])` — skip on conflict, never raise.

---

## Sentiment Analysis Rule

- Always use **VADER**, not a transformer model. Transformer models are too large for Render's free tier memory and slow cold starts.
- Star rating overrides VADER when extreme: rating ≥ 4.5 → positive, rating ≤ 1.5 → negative.

---

## Sentence-Transformers Rule

- Pre-download `all-MiniLM-L6-v2` in the `Dockerfile` `RUN` step so it's baked into the image — never download at runtime on cold start.

---

## Response Format Rules (API)

- All pipeline progress uses SSE events: `progress`, `complete`, `error`.
- Chat endpoint always returns: `{response, sources[], guardrail_triggered, guardrail_category, session_id}`.
- Chat history: last 6 turns max, stored server-side in memory (ephemeral, keyed by `session_id`).

---

## What NOT to Do

- Do not add user authentication of any kind.
- Do not use WebSockets — SSE is sufficient and simpler.
- Do not use a transformer-based sentiment model — VADER only.
- Do not call Claude with free-form text and expect JSON back — always use tool use for structured output.
- Do not use CSS selectors to scrape Trustpilot — use `__NEXT_DATA__` JSON.
- Do not hardcode API keys or secrets anywhere in code.
- Do not introduce any paid service or dependency.
- Do not use `git add -A` or `git add .` — stage files explicitly.
