# ReviewLensAI — System Design

## 1. Requirements

### Functional
- Users submit a Trustpilot URL or CSV file of product reviews
- System scrapes/parses, analyzes sentiment, clusters themes, and generates an executive summary
- Users browse reviews with filters (sentiment, rating, date)
- Users chat with their reviews via a guardrailed RAG agent
- Real-time progress feedback during pipeline processing

### Non-Functional
- Low-latency chat responses (~2-4s)
- Handles 1,000+ reviews per analysis
- Guardrails prevent hallucination and off-topic answers
- Async processing so the UI never blocks

---

## 2. High-Level Architecture

```
┌─────────────┐        HTTPS         ┌──────────────────┐       SQL/pgvector       ┌──────────────┐
│   Next.js   │ ◄──────────────────► │  FastAPI (async) │ ◄────────────────────────► │  PostgreSQL  │
│  Frontend   │   REST + SSE         │     Backend      │                           │  + pgvector  │
│  (Vercel)   │                      │    (Render)      │ ────► OpenAI API          │  (Supabase)  │
└─────────────┘                      └──────────────────┘       (embeddings + chat) └──────────────┘
```

**Three-tier split:**
- **Frontend** — Next.js on Vercel. Renders dashboards, charts, chat UI.
- **Backend** — FastAPI on Render. Hosts pipeline, RAG agent, all business logic.
- **Database** — Supabase PostgreSQL with pgvector extension for vector similarity search.

---

## 3. Data Model

```
┌──────────────┐       1:N        ┌──────────────┐
│   projects   │ ───────────────► │   reviews    │
│──────────────│                  │──────────────│
│ id (PK)      │                  │ id (PK)      │
│ source_url   │                  │ project_id   │──► FK
│ product_name │                  │ body         │
│ status       │                  │ rating       │
│ review_count │                  │ sentiment    │
│ created_at   │                  │ embedding    │──► Vector(384)
└──────┬───────┘                  │ body_hash    │──► dedup key
       │                          └──────────────┘
       │ 1:1
       ▼
┌──────────────┐
│   analyses   │
│──────────────│
│ id (PK)      │
│ project_id   │──► FK (unique)
│ sentiment_distribution (JSON)
│ rating_distribution    (JSON)
│ themes                 (JSON)
│ trend_data             (JSON)
│ executive_summary
│ pain_points            (JSON)
│ highlights             (JSON)
│ recommendations        (JSON)
└──────────────┘
```

Key decisions:
- **pgvector** stores 384-dim embeddings directly in the `reviews` table — no separate vector DB needed.
- **JSON columns** on `analyses` keep flexible structured data without extra tables.
- **body_hash** (SHA-256) with a composite unique constraint `(project_id, body_hash)` prevents duplicate reviews.

---

## 4. API Design

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/pipeline/run` | Start analysis pipeline (URL or CSV upload) |
| GET | `/api/pipeline/stream/{id}` | SSE stream for real-time progress |
| GET | `/api/projects/{id}` | Project metadata |
| GET | `/api/projects/{id}/reviews` | Paginated reviews (filterable) |
| GET | `/api/projects/{id}/analysis` | Full analysis results |
| POST | `/api/chat` | Chat with reviews (RAG) |
| DELETE | `/api/projects/{id}` | Delete project |

---

## 5. Core Flows

### Flow A: Pipeline (Upload → Analysis)

```
User submits URL/CSV
        │
        ▼
  ┌─────────────┐     SSE events      ┌──────────┐
  │  POST /run  │ ──────────────────► │ Frontend │  (progress bar updates)
  └──────┬──────┘                     └──────────┘
         │  async background task
         ▼
   ┌───────────┐    ┌───────────┐    ┌────────────┐    ┌────────────┐
   │  Scraper  │ ─► │ Ingester  │ ─► │  Analyzer  │ ─► │ Summarizer │
   └───────────┘    └───────────┘    └────────────┘    └────────────┘
    Trustpilot API   Dedup (hash)     VADER sentiment    GPT-4o-mini
    or CSV parse     Embed (OpenAI)   TF-IDF + KMeans    tool-use API
                     Store in DB      Monthly trends     → executive summary
                                                         → pain points
                                                         → recommendations
```

**Stage details:**
1. **Scraper** — Fetches Trustpilot JSON API (paginated, concurrent) or parses CSV with flexible column mapping.
2. **Ingester** — Deduplicates via SHA-256 hash, generates embeddings in batches of 64 via `text-embedding-3-small` (384 dims), bulk inserts.
3. **Analyzer** — VADER sentiment with star-rating override, TF-IDF + KMeans clustering (up to 8 themes), monthly trend aggregation.
4. **Summarizer** — Samples ~30 representative reviews, calls GPT-4o-mini with structured tool-use to produce executive summary, pain points, highlights, recommendations, and theme labels.

### Flow B: Chat (RAG with Guardrails)

```
User Question
      │
      ▼
┌─────────────────┐   blocked    ┌──────────────────┐
│  Pre-filter     │ ───────────► │ Contextual       │
│  (regex + flag) │              │ Fallback Message  │
└────────┬────────┘              └──────────────────┘
         │ passed
         ▼
┌─────────────────┐
│ Vector Search   │  pgvector cosine similarity
│ top 8 chunks    │  threshold ≥ 0.20
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LLM Call        │  system prompt + analysis context
│ GPT-4o-mini     │  + retrieved chunks + chat history
└────────┬────────┘
         │
         ▼
┌─────────────────┐   blocked    ┌──────────────────┐
│  Post-validate  │ ───────────► │ Contextual       │
│  (hallucination │              │ Fallback Message  │
│   + URL check)  │              └──────────────────┘
└────────┬────────┘
         │ passed
         ▼
   Chat Response
   + source citations
   + follow-up suggestions
```

**Three-layer guardrail system:**
1. **Pre-filter** — Regex patterns catch off-topic questions (competitors, weather, stocks). Checks if vector search returned relevant chunks.
2. **System prompt** — Instructs the LLM to answer *only* from provided review excerpts with citations.
3. **Post-validate** — Scans response for hallucination markers ("generally speaking", "research shows") and external URLs not in the source data.

---

## 6. Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Vector storage | pgvector in PostgreSQL | One database for everything — no separate Pinecone/Weaviate to manage |
| Embedding model | text-embedding-3-small (384d) | Good accuracy at low cost and fast inference |
| Chat model | GPT-4o-mini | Fast, cheap, sufficient for grounded Q&A over retrieved excerpts |
| Sentiment analysis | VADER + rating override | No ML training needed; hybrid approach catches edge cases |
| Theme clustering | TF-IDF + KMeans | Simple, interpretable, works well for review text at this scale |
| Structured LLM output | OpenAI tool-use API | Guarantees JSON schema conformance for summaries |
| Real-time updates | Server-Sent Events | Simpler than WebSockets for unidirectional progress streaming |
| Deduplication | SHA-256(url + body[:200]) | Fast, deterministic, handles re-scrapes cleanly |

---

## 7. Scalability Considerations

**Current design handles ~1,000 reviews per project comfortably.** For larger scale:

- **Scraping** — Already concurrent (5 parallel requests). Increase concurrency or add a task queue (Celery/Redis) for multiple simultaneous pipelines.
- **Embeddings** — Batched at 64/call. Could parallelize batches across workers.
- **Vector search** — pgvector with IVFFlat or HNSW index for projects with 10K+ reviews.
- **Chat** — Stateless design (history passed per request) means horizontal scaling is trivial.
- **Pipeline** — Currently runs as an async background task in the same process. For production scale, move to a dedicated worker with a job queue.

---

## 8. Tech Stack Summary

```
Frontend:  Next.js 14 · TypeScript · Tailwind CSS · Recharts
Backend:   FastAPI · Python 3.11 · SQLAlchemy 2.0 (async) · Pydantic v2
Database:  PostgreSQL + pgvector (Supabase)
AI/ML:     OpenAI (embeddings + chat) · VADER · scikit-learn (TF-IDF, KMeans)
Infra:     Vercel (frontend) · Render (backend) · Supabase (database)
Realtime:  Server-Sent Events (SSE)
```
