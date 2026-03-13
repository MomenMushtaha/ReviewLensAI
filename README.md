# ReviewLens AI

**Review Intelligence Portal** — Scrape Trustpilot reviews, analyze them with AI, and ask questions about them through a guardrailed chat interface.

> **Development Note (March 2026)**: Vercel v0 is now leading development. Codex is reserved for stubborn bugs.
>
> **Earlier Update (March 2026)**: Claude Code ran out of usage, so Codex will be used until the limit resets.

## Architecture

```
Trustpilot URL / CSV
       ↓
  [Scraper]  — httpx + __NEXT_DATA__ JSON extraction
       ↓
  [Ingester] — dedupe, Supabase PostgreSQL, pgvector embeddings
       ↓
  [Analyzer] — VADER sentiment, TF-IDF+KMeans themes, trends
       ↓
  [Summarizer] — OpenAI tool-use API for structured executive brief
       ↓
  [RAG Agent] — pgvector retrieval + 3-layer guardrail + OpenAI chat
```

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.11 + FastAPI (async) |
| Database | Supabase PostgreSQL + pgvector |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` (local, free) |
| AI Model | GPT-4o-mini (default) via OpenAI API |
| Sentiment | VADER (local, no API cost) |
| Themes | scikit-learn TF-IDF + KMeans |
| Frontend | Next.js 14 App Router + Tailwind CSS + Recharts |
| Deployment | Render (backend) + Vercel (frontend) |

## Getting Started

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in DATABASE_URL and OPENAI_API_KEY
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

### Backend (`.env`)

```bash
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
OPENAI_MODEL=gpt-4o-mini
ALLOWED_ORIGINS=http://localhost:3000
```

### Frontend (`.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Features

- **Scraper**: Trustpilot `__NEXT_DATA__` extraction + JSON-LD fallback + CSV upload
- **Deduplication**: SHA-256 hash of `(source_url + body[:200])`
- **Sentiment**: VADER compound score with star-rating override
- **Theme clustering**: TF-IDF + KMeans (up to 8 clusters), AI-labeled
- **Guardrailed chat**: 3-layer guardrail (regex pre-filter → system prompt → hallucination scan)
- **Real-time progress**: Server-Sent Events stream during pipeline execution
- **pgvector RAG**: Cosine similarity search over 384-dim embeddings

## Deployment

- Backend → Render free tier (Docker, no persistent disk needed — all data in Supabase)
- Frontend → Vercel (zero-config Next.js deploy)

See `render.yaml` for Render configuration.
