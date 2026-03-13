# ReviewLens AI — Implementation Plan

## Context

This is a greenfield project for the FutureSight take-home assignment. The goal is to build a "Review Intelligence Portal" that ingests product reviews from a public platform (Trustpilot as primary target), analyzes them, and provides a guardrailed Q&A interface. The pipeline flows: Scraper → Ingester → Analyzer → Summarizer → AI Agent with Guardrails.

---

## Architecture Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Backend | Python 3.11 + FastAPI | Best ecosystem for ML/NLP; async-native; Pydantic v2 |
| Frontend | Next.js 14 (App Router) | SSR, Vercel-native free deployment |
| Database | Supabase PostgreSQL via SQLAlchemy + asyncpg | Hosted, free tier, no persistent disk needed on Render |
| Vector Store | pgvector (Supabase built-in extension) | Eliminates ChromaDB; one service for both relational + vector data |
| Embeddings | `sentence-transformers` (all-MiniLM-L6-v2) | Free, local, 384-dim, fast on CPU |
| AI Model | gpt-4o-mini (default, via OpenAI API) | Low cost; good quality for summarization and chat |
| Scraper | httpx + BeautifulSoup4 | Trustpilot is SSR; lighter than Playwright |
| Progress | Server-Sent Events (SSE) | Real-time progress without WebSocket complexity |
| Target Platform | Trustpilot (primary) + CSV upload (fallback) | JSON-LD + `__NEXT_DATA__` structured data — no brittle CSS selectors |
| Deployment | Render free tier (backend) + Vercel (frontend) + Supabase (DB) | All free; no persistent disk required since DB is external |

---

## Repository Structure

```
ReviewLensAI/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app factory, CORS, lifespan
│   │   ├── config.py                # Settings via pydantic-settings
│   │   ├── database.py              # SQLAlchemy engine (asyncpg), session factory, embedder singleton
│   │   ├── models/
│   │   │   ├── review.py            # Review ORM model (includes vector(384) embedding column)
│   │   │   ├── project.py           # Project ORM model (tracks pipeline status)
│   │   │   └── analysis.py          # Analysis + summary ORM model
│   │   ├── schemas/
│   │   │   ├── review.py            # RawReview, ReviewOut pydantic schemas
│   │   │   ├── project.py           # ProjectCreate, ProjectOut
│   │   │   └── analysis.py          # AnalysisResult, ThemeCluster, SummaryResult
│   │   ├── pipeline/
│   │   │   ├── scraper.py           # Stage 1: URL scraping + CSV parsing
│   │   │   ├── ingester.py          # Stage 2: Normalize, dedupe, embed, store
│   │   │   ├── analyzer.py          # Stage 3: Sentiment, themes, trends
│   │   │   ├── summarizer.py        # Stage 4: Claude API executive summary
│   │   │   └── orchestrator.py      # Sequences stages + drives SSE progress
│   │   ├── agents/
│   │   │   ├── rag_agent.py         # pgvector similarity search + Claude chat
│   │   │   ├── guardrails.py        # Pre/post scope filters
│   │   │   └── prompts.py           # All system/user prompt templates
│   │   ├── routers/
│   │   │   ├── projects.py          # /api/projects CRUD
│   │   │   ├── pipeline.py          # /api/pipeline/run, /api/pipeline/stream/{id}
│   │   │   └── chat.py              # /api/chat
│   │   └── utils/
│   │       └── text_cleaner.py      # HTML stripping, unicode normalization
│   ├── alembic/
│   │   └── versions/0001_initial.py
│   ├── tests/
│   │   ├── test_scraper.py
│   │   ├── test_ingester.py
│   │   ├── test_analyzer.py
│   │   └── test_guardrails.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Landing: URL input + CSV upload
│   │   │   └── project/[id]/page.tsx # Dashboard: Overview/Reviews/Themes/Chat tabs
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui primitives (Button, Card, etc.)
│   │   │   ├── UrlInputForm.tsx      # URL input + CSV drag-drop
│   │   │   ├── PipelineProgress.tsx  # SSE-driven progress bar
│   │   │   ├── ReviewTable.tsx       # Paginated, filterable review list
│   │   │   ├── SentimentChart.tsx    # Recharts donut
│   │   │   ├── TrendChart.tsx        # Recharts line chart (rating over time)
│   │   │   ├── ThemeCard.tsx         # Cluster label + keywords + stats
│   │   │   ├── SummaryCard.tsx       # Executive summary
│   │   │   ├── PainPointsList.tsx
│   │   │   ├── HighlightsList.tsx
│   │   │   └── ChatPanel.tsx         # Chat interface with guardrail indicator
│   │   ├── hooks/
│   │   │   ├── usePipelineSSE.ts     # EventSource hook
│   │   │   └── useChat.ts            # Chat state + API calls
│   │   ├── lib/
│   │   │   ├── api.ts                # Typed fetch wrapper for all backend calls
│   │   │   └── utils.ts              # cn(), formatters
│   │   └── types/index.ts            # TS types mirroring backend schemas
│   ├── package.json
│   ├── tailwind.config.ts
│   └── .env.local.example
├── .github/workflows/
│   └── ci.yml                        # Lint + test on push
├── render.yaml                        # Render deployment config (no disk block needed)
├── .gitignore
└── README.md
```

---

## Component 1: Scraper (`backend/app/pipeline/scraper.py`)

**Responsibilities:** Accept a URL or CSV bytes → return `list[RawReview]` (no DB writes).

**Output schema:**
```python
class RawReview(BaseModel):
    source_url: str
    platform: str           # "trustpilot" | "csv"
    external_id: str | None
    reviewer_name: str | None
    rating: float | None    # 1.0–5.0
    title: str | None
    body: str               # Required
    date: datetime | None
    helpful_count: int = 0
    verified: bool = False
```

**Trustpilot Strategy:**
- URL pattern: `https://www.trustpilot.com/review/{domain}?page=N`
  (e.g. `https://www.trustpilot.com/review/netflix.com?page=2`)
- **Primary extraction path — `__NEXT_DATA__` JSON blob:**
  Parse `<script id="__NEXT_DATA__" type="application/json">` from the HTML.
  This contains all review data as structured JSON — no CSS selectors needed.
  Path: `props.pageProps.reviews[]` with fields `text`, `rating`, `dates.publishedDate`, `consumer.displayName`, `title`, `isVerified`
- **Fallback extraction path — JSON-LD:**
  Parse `<script type="application/ld+json">` blocks with `@type: "Review"`.
  Fields: `reviewBody`, `reviewRating.ratingValue`, `author.name`, `datePublished`
- Async fetching via `httpx.AsyncClient` with semaphore (max 3 concurrent pages)
- Cap at 10 pages (200 reviews — Trustpilot shows 20/page) by default (`SCRAPER_MAX_PAGES` env)
- Headers: Chrome `User-Agent` + `Accept-Language: en-US` to pass Cloudflare
- Exponential backoff on 429/503; 1s polite delay between page batches
- Total review count parsed from `__NEXT_DATA__` on page 1 for progress reporting

**CSV Fallback:**
- Flexible column detection mapping common names (`review`/`text`/`body` → body, `stars`/`score`/`rating` → rating, etc.)
- Minimum requirement: `body` column must be present
- Use `pandas.read_csv` for parsing

**Libraries:** `httpx[http2]`, `beautifulsoup4`, `lxml`, `pandas`

---

## Component 2: Ingester (`backend/app/pipeline/ingester.py`)

**Responsibilities:** `list[RawReview]` + project_id → normalize, deduplicate, persist to Supabase PostgreSQL with pgvector embeddings.

**Deduplication:** SHA-256 hash of `(source_url + body[:200])` stored in `reviews.body_hash` (unique index). Skip on conflict.

**SQLAlchemy Models:**

```python
# models/project.py
class Project(Base):
    id: Mapped[str]           # UUID, PK
    source_url: Mapped[str | None]
    platform: Mapped[str]
    product_name: Mapped[str | None]
    status: Mapped[str]       # pending|scraping|ingesting|analyzing|summarizing|ready|error
    error_message: Mapped[str | None]
    review_count: Mapped[int] = 0
    created_at: Mapped[datetime]
    completed_at: Mapped[datetime | None]

# models/review.py
from pgvector.sqlalchemy import Vector

class Review(Base):
    id: Mapped[str]           # UUID, PK
    project_id: Mapped[str]   # FK → projects.id
    platform: Mapped[str]
    external_id: Mapped[str | None]
    reviewer_name: Mapped[str | None]
    rating: Mapped[float | None]
    title: Mapped[str | None]
    body: Mapped[str]
    body_hash: Mapped[str]    # unique index
    date: Mapped[datetime | None]
    helpful_count: Mapped[int] = 0
    verified: Mapped[bool] = False
    sentiment: Mapped[str | None]     # populated by Analyzer
    embedding: Mapped[list[float]] = mapped_column(Vector(384), nullable=True)
    created_at: Mapped[datetime]
```

**Embedding strategy:**
- Compute embeddings in batches of 64 using `SentenceTransformer("all-MiniLM-L6-v2")`
- Store as `vector(384)` directly on each `Review` row — no separate vector store
- Embedder loaded once at app startup (lifespan), shared singleton
- Run `CREATE EXTENSION IF NOT EXISTS vector;` in Alembic migration 0001

**Output:** `IngestionResult(total, inserted, skipped_duplicates)`

**Libraries:** `sqlalchemy[asyncio]`, `asyncpg`, `pgvector`, `sentence-transformers`

---

## Component 3: Analyzer (`backend/app/pipeline/analyzer.py`)

**Responsibilities:** Read all reviews for a project → compute sentiment, themes, trends → persist to `analyses` table.

**Analysis steps:**

1. **Sentiment** (per-review): VADER (`vaderSentiment`) — `compound ≥ 0.05` → positive, `≤ -0.05` → negative, else neutral. Override with star rating (≥4.5 → positive, ≤1.5 → negative). Write `sentiment` back to each `Review` row.

2. **Theme clustering**: `TfidfVectorizer(max_features=500, ngram_range=(1,2), stop_words="english")` + `KMeans(n_clusters=min(8, n//5))`. Top 5 TF-IDF terms per centroid = cluster keywords. Theme labels are generated by Summarizer (Claude), not here.

3. **Rating distribution**: dict `{"1": n, "2": n, ..., "5": n}` from raw counts.

4. **Trend**: Group by year-month; `avg_rating` + `count` per period. Skip if < 3 months of data.

5. **Top reviews**: Top 5 by (rating + sentiment score) for highlights; bottom 5 for pain points.

**Analysis ORM model:**
```python
class Analysis(Base):
    id: Mapped[str]           # UUID, PK
    project_id: Mapped[str]   # FK, unique
    sentiment_distribution: Mapped[str]  # JSON
    rating_distribution: Mapped[str]     # JSON
    themes: Mapped[str]                  # JSON list[ThemeCluster] (without labels yet)
    trend_data: Mapped[str]              # JSON
    top_positive_reviews: Mapped[str]    # JSON list[review_id]
    top_negative_reviews: Mapped[str]    # JSON list[review_id]
    # Populated by Summarizer:
    executive_summary: Mapped[str | None]
    pain_points: Mapped[str | None]      # JSON
    highlights: Mapped[str | None]       # JSON
    recommendations: Mapped[str | None]  # JSON
    theme_labels: Mapped[str | None]     # JSON dict[cluster_index → label]
    created_at: Mapped[datetime]
```

**Libraries:** `scikit-learn`, `vaderSentiment`, `pandas`, `numpy`

---

## Component 4: Summarizer (`backend/app/pipeline/summarizer.py`)

**Responsibilities:** Take `AnalysisResult` + sampled reviews → OpenAI API call → write structured summary back to `analyses` table.

**Token budget:** Sample up to 30 reviews (top 5 positive, top 5 negative, 20 random); truncate each body to 300 chars. ~2,500 input tokens; `max_tokens=1500`.

**OpenAI call:** Use **tool use** (function calling) with a `produce_summary` tool to enforce structured output without brittle JSON parsing:

```python
tools = [{
    "name": "produce_summary",
    "input_schema": {
        "type": "object",
        "properties": {
            "executive_summary": {"type": "string"},
            "pain_points": {"type": "array", "items": {"type": "object",
                "properties": {"title": ..., "description": ..., "frequency": ...}}},
            "highlights": {"type": "array", ...},
            "recommendations": {"type": "array", "items": {"type": "object",
                "properties": {"priority": ..., "action": ..., "rationale": ...}}},
            "theme_labels": {"type": "object", "additionalProperties": {"type": "string"}}
        },
        "required": ["executive_summary", "pain_points", "highlights", "recommendations", "theme_labels"]
    }
}]
```

System prompt: "You are a product intelligence analyst. Analyze the provided review data and produce a structured executive brief. Be specific, cite patterns from the data. Do not invent information not present in the reviews."

**Retry:** `tenacity` — 3 attempts, exponential backoff starting at 2s.

**Libraries:** `openai>=1.40.0`, `tenacity`

---

## Component 5: AI Agent with Guardrails (`backend/app/agents/`)

**Architecture: Three-Layer Guardrail**

```
User question
      │
      ▼
[Layer 1: Pre-filter — regex + similarity check]
  └─ Off-topic patterns (competitor names, general knowledge phrases)
  └─ pgvector similarity score < 0.25 threshold → REJECT
      │
      ▼
[pgvector retrieval: top-8 reviews by cosine similarity]
      │
      ▼
[Layer 2: System prompt enforcement]
  └─ Strict "only answer from provided reviews" instruction
  └─ Product/platform/date-range context injected
  └─ Explicit decline format specified
      │
      ▼
[OpenAI API call — gpt-4o-mini]
      │
      ▼
[Layer 3: Post-response validator]
  └─ Scan for hallucination markers ("generally speaking", "typically")
  └─ References to external URLs not in retrieved chunks
  └─ If triggered → replace with safe fallback message
      │
      ▼
Return: { response, sources[], guardrail_triggered, guardrail_category }
```

**System Prompt (`prompts.py`):**
```
You are ReviewLens, an AI assistant that answers questions EXCLUSIVELY about the
product reviews loaded in this analysis session.

STRICT RULES:
1. ONLY answer questions answerable from the provided review excerpts below.
2. If a question cannot be answered from the reviews, respond with exactly:
   "I can only answer questions about the reviews in this session. That question
    goes beyond the available review data."
3. Never provide general knowledge, opinions, or information about other products.
4. Never compare this product to competitors unless reviews themselves mention it.
5. Always cite which reviews support your answer (reviewer name or date).
6. If asked about your own nature: "I'm ReviewLens, focused only on analyzing
   the reviews you've provided."

AVAILABLE REVIEW CONTEXT:
{retrieved_chunks}

PROJECT CONTEXT:
- Product: {product_name}
- Total reviews: {review_count}
- Platform: {platform}
- Date range: {date_range}
```

**pgvector RAG retrieval (`rag_agent.py`):**
```python
# Cosine similarity search via pgvector
query_embedding = embedder.encode([question])[0].tolist()
results = await db.execute(
    text("""
        SELECT id, body, reviewer_name, rating, date,
               1 - (embedding <=> :qemb) AS similarity
        FROM reviews
        WHERE project_id = :pid
          AND 1 - (embedding <=> :qemb) >= :threshold
        ORDER BY embedding <=> :qemb
        LIMIT 8
    """),
    {"qemb": str(query_embedding), "pid": project_id, "threshold": 0.20}
)
```

**Chat history:** Last 6 turns (3 user + 3 assistant) in server-side dict keyed by `session_id` (UUID from frontend localStorage). Ephemeral, no persistence.

**Rejection response format:**
```json
{
  "response": "I can only answer questions about the reviews in this session...",
  "sources": [],
  "guardrail_triggered": true,
  "guardrail_category": "off_topic"
}
```
Categories: `off_topic` | `no_relevant_reviews` | `hallucination_detected` | `harmful_content`

---

## API Endpoints

### `/api/projects`
| Method | Path | Description |
|---|---|---|
| POST | `/api/projects` | Create project → `{project_id}` |
| GET | `/api/projects/{id}` | Status + metadata |
| GET | `/api/projects/{id}/reviews` | Paginated reviews (`?page&limit&sentiment&rating_min`) |
| GET | `/api/projects/{id}/analysis` | Full analysis JSON |
| DELETE | `/api/projects/{id}` | Delete project + data |

### `/api/pipeline`
| Method | Path | Description |
|---|---|---|
| POST | `/api/pipeline/run` | Start pipeline (multipart: `source_type`, `url`, `file`) |
| GET | `/api/pipeline/stream/{id}` | SSE stream for progress |

**SSE event format:**
```
event: progress
data: {"stage": "scraping", "progress": 45, "message": "Fetched 45 of 100 reviews"}

event: complete
data: {"project_id": "abc123", "review_count": 87}

event: error
data: {"stage": "scraping", "message": "403 Forbidden — Trustpilot blocked the request"}
```

### `/api/chat`
| Method | Path | Description |
|---|---|---|
| POST | `/api/chat` | Send question → `{response, sources, guardrail_triggered, session_id}` |
| GET | `/api/health` | Health check (for frontend wake-up ping) |

---

## Frontend Pages

### Page 1: Landing (`/`)
- Two-tab form: URL input | CSV upload (drag-drop)
- On submit → POST `/api/pipeline/run` → redirect to `/project/{id}?loading=true`
- Recent analyses list from localStorage (max 5 entries)
- "Example:" hint text with Trustpilot URL format (e.g. `https://www.trustpilot.com/review/netflix.com`)

### Page 2: Project Dashboard (`/project/[id]`)
- Header: product name, platform badge, review count, date range
- If `?loading=true`: `PipelineProgress` (SSE-connected, replaces on `event: complete`)
- 4-tab layout (shown after pipeline completes):
  - **Overview**: `SummaryCard` + `PainPointsList` + `HighlightsList` + `SentimentChart` + `TrendChart` + `RecommendationsList`
  - **Reviews**: `ReviewTable` (sortable, filterable by sentiment/rating/date)
  - **Themes**: Grid of `ThemeCard` (cluster label, keywords, avg rating, review count)
  - **Chat**: `ChatPanel` with source citations + guardrail indicator badge

---

## Orchestrator (`backend/app/pipeline/orchestrator.py`)

Sequences all 4 stages, updates project status in DB, and pushes events to an `asyncio.Queue` per project (drained by SSE endpoint):

```
pending → scraping (stage 1) → ingesting (stage 2) → analyzing (stage 3) → summarizing (stage 4) → ready
                                                                                                  ↓ error (any stage)
```

SSE endpoint holds per-project queues in a module-level dict, drains with `asyncio.Queue.get()`.

---

## Environment Variables

**Backend (`.env`):**
```bash
# Supabase
DATABASE_URL=postgresql+asyncpg://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=eyJ...

# AI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# App
ENV=production
SCRAPER_MAX_PAGES=10
SCRAPER_CONCURRENCY=3
USE_SIMPLE_SENTIMENT=true
EMBEDDING_MODEL=all-MiniLM-L6-v2
SIMILARITY_THRESHOLD=0.20
MAX_CHAT_HISTORY_TURNS=6
ALLOWED_ORIGINS=https://reviewlens.vercel.app,http://localhost:3000
```

**Frontend (`.env.local`):**
```bash
NEXT_PUBLIC_API_URL=https://reviewlens-api.onrender.com
```

---

## Deployment

- **Database → Supabase free tier:** Hosted PostgreSQL with pgvector extension. 500MB storage, no ops required. Enable `vector` extension in Supabase dashboard under Database → Extensions.
- **Backend → Render free tier:** Docker container. No persistent disk needed — all data lives in Supabase. Alembic migration runs automatically on startup (`alembic upgrade head` in lifespan). Sentence-transformers model pre-downloaded in `Dockerfile` `RUN` step.
- **Frontend → Vercel free tier:** Zero-config Next.js deploy from GitHub.
- **CI → GitHub Actions:** `pytest` + `eslint/tsc` + `next build` on push to `main`.

**`render.yaml`** — no `disk` block required (Supabase handles persistence).

---

## Key Libraries

**Backend:** `fastapi`, `uvicorn`, `pydantic-settings`, `sqlalchemy[asyncio]`, `asyncpg`, `pgvector`, `alembic`, `httpx[http2]`, `beautifulsoup4`, `lxml`, `pandas`, `scikit-learn`, `vaderSentiment`, `sentence-transformers`, `openai`, `tenacity`, `python-multipart`

**Frontend:** `next@14`, `react@18`, `recharts`, `tailwindcss`, `@radix-ui/*` (shadcn/ui), `clsx`, `tailwind-merge`

---

## Implementation Sequence

1. **Foundation:** repo init, `pyproject.toml`, SQLAlchemy models, Alembic migration (with `CREATE EXTENSION vector`), FastAPI app factory, Next.js scaffold
2. **Scraper:** Trustpilot `__NEXT_DATA__` scraping + CSV parser
3. **Ingester:** normalize, dedupe, Supabase PostgreSQL persistence, pgvector embedding column
4. **Analyzer:** VADER sentiment, TF-IDF/KMeans themes, trend data
5. **Summarizer:** Claude tool-use API call, structured output
6. **Orchestrator + API:** sequential pipeline, SSE streaming, all 3 routers
7. **Agent + Guardrails:** pgvector RAG retrieval, three-layer guardrail, chat endpoint
8. **Frontend:** landing page, pipeline progress, project dashboard (4 tabs), chat panel
9. **Deployment:** Dockerfile, render.yaml, vercel.json, GitHub Actions CI
10. **Polish:** README, `/ai-transcripts` dir, health check, cold-start spinner

---

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| Trustpilot `__NEXT_DATA__` schema changes | JSON-LD fallback path; both parsed on every request |
| Render cold start (~30s) | `/api/health` ping on frontend load; "Waking up..." spinner |
| Sentence-transformers cold start | Pre-download model in `Dockerfile` `RUN` step |
| Supabase free tier auto-pause (1 week inactivity) | Keep-alive ping via Render cron or GitHub Actions scheduled workflow |
| Supabase 500MB storage limit | 200 reviews × ~2KB avg = ~0.4MB per project; well within limit |
| Claude API rate limits | `tenacity` retry; use haiku model by default |
| Trustpilot Cloudflare 403 | Chrome User-Agent + Accept-Language header; polite delays; CSV fallback always available |
