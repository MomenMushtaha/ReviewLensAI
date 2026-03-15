# ReviewLens AI

**Review Intelligence Portal** — Paste a Trustpilot URL or upload a CSV to get AI-powered sentiment analysis, theme clustering, rating trends, and a guardrailed Q&A chat assistant.

**Live:** [frontend-q542sakgl-momenmushtahas-projects.vercel.app](https://frontend-ten-virid-65.vercel.app)| **API:** [backend-pzpwheyys-momenmushtahas-projects.vercel.app](https://backend-pzpwheyys-momenmushtahas-projects.vercel.app/docs)

> Built entirely by [Claude Code](https://claude.ai/claude-code) (Anthropic's AI coding agent).

---

## How It Works

```
Trustpilot URL / CSV Upload
         |
    [ Scraper ]       httpx + __NEXT_DATA__ JSON extraction + JSON-LD fallback
         |
    [ Ingester ]      SHA-256 dedupe, Supabase PostgreSQL, pgvector embeddings
         |
    [ Analyzer ]      VADER sentiment, TF-IDF + KMeans theme clustering, trends
         |
    [ Summarizer ]    OpenAI tool-use API for structured executive brief
         |
    [ RAG Agent ]     pgvector cosine similarity + 3-layer guardrail + OpenAI chat
```

1. Paste a Trustpilot business URL (e.g. `trustpilot.com/review/airbnb.com`) or upload a CSV
2. Reviews are scraped, deduplicated, and stored in PostgreSQL with vector embeddings
3. Sentiment analysis, theme clustering, and trend computation run automatically
4. An AI summarizer generates an executive brief with labeled themes
5. Chat with your reviews using RAG-powered Q&A

## Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| **Python 3.11** | Runtime |
| **FastAPI** | Fully async REST API framework |
| **Uvicorn** | ASGI server with HTTP/2 support |
| **Pydantic v2** | Request/response validation and settings management |
| **SQLAlchemy 2.0** | Async ORM with asyncpg driver |
| **Alembic** | Database schema migrations |
| **httpx** | Async HTTP client with HTTP/2 for Trustpilot scraping |
| **BeautifulSoup4 + lxml** | HTML parsing and JSON-LD extraction |
| **pandas + NumPy** | Data manipulation and numerical computation |
| **scikit-learn** | TF-IDF vectorization + KMeans clustering for theme discovery |
| **VADER Sentiment** | Rule-based sentiment analysis (no API cost) |
| **OpenAI API** | GPT-4o-mini for summaries, chat, and `text-embedding-3-small` for vector embeddings |
| **pgvector** | PostgreSQL vector similarity search for RAG retrieval |
| **tenacity** | Retry logic for external API calls |
| **python-multipart** | File upload handling for CSV imports |

### Frontend

| Technology | Purpose |
|---|---|
| **Next.js 14** | React framework with App Router and SSR |
| **React 18** | UI component library |
| **TypeScript** | Type-safe frontend development |
| **Tailwind CSS** | Utility-first styling with dark glassmorphism theme |
| **Recharts** | Interactive charts for sentiment and trend visualization |
| **Lucide React** | SVG icon library |
| **react-markdown** | Markdown rendering in chat responses |
| **class-variance-authority** | Component variant management for UI primitives |
| **tailwind-merge + clsx** | Conditional class name composition |

### Infrastructure

| Technology | Purpose |
|---|---|
| **Supabase** | Managed PostgreSQL database with pgvector extension |
| **Render** | Backend Docker deployment (free tier) |
| **Vercel** | Frontend hosting with edge network and preview deploys |
| **Docker** | Backend containerization |
| **GitHub** | Source control and CI/CD integration |

### AI / ML Pipeline

| Component | Technology |
|---|---|
| **Embeddings** | OpenAI `text-embedding-3-small` (384 dimensions) via async API |
| **LLM** | GPT-4o-mini via OpenAI tool-use API |
| **Sentiment** | VADER compound score with star-rating override |
| **Clustering** | TF-IDF + KMeans (up to 8 themes, sentiment-diverse) |
| **RAG** | pgvector cosine similarity + 3-layer guardrail system |
| **Deduplication** | SHA-256 hash of `(source_url + body[:200])` per project |

## Features

- **Trustpilot Scraper** — `__NEXT_DATA__` extraction with JSON-LD fallback, paginated multi-page scraping, CSV upload support
- **Quick / Deep Analysis Modes** — Quick (~200 reviews) available now; Deep (~2,000 reviews) coming soon
- **Inline Progress** — Real-time pipeline progress shown under Recent Analyses via SSE, no page navigation
- **Cancel Analysis** — Stop a running analysis mid-scrape with responsive asyncio-based cancellation
- **Duplicate Detection** — Blocks re-analyzing the same URL + mode combo; matches by URL or product name
- **Smart Deduplication** — SHA-256 hash scoped per project prevents duplicate reviews
- **Sentiment Analysis** — VADER compound score with star-rating override for extreme ratings (1-2 stars force negative, 4-5 stars force positive)
- **Theme Discovery** — TF-IDF vectorization + KMeans clustering (up to 8 themes), with guaranteed sentiment diversity
- **AI Summaries** — OpenAI tool-use API generates labeled themes and an executive brief
- **Rating Trends** — Monthly average rating and review volume charts via Recharts
- **Guardrailed Chat** — 3-layer guardrail (regex pre-filter, system prompt boundary, hallucination scan) keeps responses grounded in review data
- **RAG Retrieval** — pgvector cosine similarity search over 384-dimensional embeddings
- **Real-time Progress** — Server-Sent Events stream pipeline status to the frontend
- **Review Browser** — Sortable, filterable, paginated review table with sentiment badges and star ratings
- **Failed Analysis Handling** — Failed analyses show error reason, are non-clickable, and can be deleted
- **Dark Glassmorphism UI** — Mesh gradient backgrounds, frosted glass cards, indigo accent palette

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- A Supabase project (or any PostgreSQL with pgvector)
- An OpenAI API key

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL and OPENAI_API_KEY
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+asyncpg://...`) |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | Chat/summary model (default: `gpt-4o-mini`) |
| `EMBEDDING_MODEL` | Embedding model (default: `text-embedding-3-small`) |
| `EMBEDDING_DIMENSIONS` | Vector dimensions (default: `384`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `SCRAPER_MAX_PAGES` | Max Trustpilot pages to scrape (default: `50`) |
| `SCRAPER_CONCURRENCY` | Concurrent scrape requests (default: `5`) |
| `SIMILARITY_THRESHOLD` | RAG retrieval threshold (default: `0.20`) |
| `MAX_CHAT_HISTORY_TURNS` | Chat context window (default: `6`) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API URL (default: `http://localhost:8000`) |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/pipeline/run` | Start a new analysis pipeline |
| `GET` | `/api/pipeline/stream/{id}` | SSE stream for pipeline progress |
| `POST` | `/api/pipeline/cancel/{id}` | Cancel a running pipeline |
| `GET` | `/api/projects/{id}` | Get project details |
| `DELETE` | `/api/projects/{id}` | Delete a project |
| `GET` | `/api/projects/{id}/reviews` | Get paginated, sortable, filterable reviews |
| `GET` | `/api/projects/{id}/analysis` | Get analysis (themes, sentiment, trends) |
| `POST` | `/api/chat` | RAG-powered Q&A chat |

## Deployment

- **Backend** — Vercel (serverless). See `backend/vercel.json`.
- **Frontend** — Vercel with Root Directory set to `frontend/`.
