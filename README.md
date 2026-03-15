# ReviewLens AI

**Review Intelligence Portal** — Paste a Trustpilot URL or upload a CSV to get AI-powered sentiment analysis, theme clustering, rating trends, and a guardrailed Q&A chat assistant. Built with FastAPI, Next.js, and OpenAI.

**Live:** [v0-review-lens-ai.vercel.app](https://v0-review-lens-ai.vercel.app) | **API:** [reviewlens-api.onrender.com](https://reviewlens-api.onrender.com/docs)

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

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, FastAPI (fully async), Alembic migrations |
| **Database** | Supabase PostgreSQL + pgvector |
| **Embeddings** | `all-MiniLM-L6-v2` via sentence-transformers (local, free) |
| **LLM** | GPT-4o-mini via OpenAI API |
| **Sentiment** | VADER (local, no API cost) with star-rating override |
| **Clustering** | scikit-learn TF-IDF + KMeans |
| **Frontend** | Next.js 14, Tailwind CSS, Recharts |
| **Deployment** | Render (backend Docker) + Vercel (frontend) |

## Features

- **Trustpilot Scraper** — `__NEXT_DATA__` extraction with JSON-LD fallback, paginated multi-page scraping, CSV upload support
- **Smart Deduplication** — SHA-256 hash of `(source_url + body[:200])`, scoped per project
- **Sentiment Analysis** — VADER compound score with star-rating override for extreme ratings (1-2 stars force negative, 4-5 stars force positive)
- **Theme Discovery** — TF-IDF vectorization + KMeans clustering (up to 8 themes), with guaranteed sentiment diversity
- **AI Summaries** — OpenAI tool-use API generates labeled themes and an executive brief
- **Rating Trends** — Monthly average rating and review volume charts via Recharts
- **Guardrailed Chat** — 3-layer guardrail (regex pre-filter, system prompt boundary, hallucination scan) keeps responses grounded in review data
- **RAG Retrieval** — pgvector cosine similarity search over 384-dimensional sentence embeddings
- **Real-time Progress** — Server-Sent Events stream pipeline status to the frontend
- **Review Browser** — Sortable, paginated review table with sentiment badges and star ratings

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

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+asyncpg://...`) |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | Model to use (default: `gpt-4o-mini`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `SCRAPER_MAX_PAGES` | Max Trustpilot pages to scrape (default: `10`) |
| `SCRAPER_CONCURRENCY` | Concurrent scrape requests (default: `3`) |
| `EMBEDDING_MODEL` | Sentence transformer model (default: `all-MiniLM-L6-v2`) |
| `SIMILARITY_THRESHOLD` | RAG retrieval threshold (default: `0.20`) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API URL (default: `http://localhost:8000`) |

## Deployment

- **Backend** — Render free tier (Docker). See `render.yaml` and `backend/Dockerfile`.
- **Frontend** — Vercel with Root Directory set to `frontend/`.
