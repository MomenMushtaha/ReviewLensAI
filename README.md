# ReviewLens AI

**Review Intelligence Portal** — Scrape Trustpilot reviews, analyze them with AI, and ask questions about them through a guardrailed chat interface.

> **Development Note (March 2026)**: Frontend development transitioned to Vercel v0. Codex on standby.

## Architecture

```
Trustpilot URL / CSV
       ↓
  [Scraper]  — fetch + cheerio + __NEXT_DATA__ JSON extraction
       ↓
  [Ingester] — dedupe, Supabase PostgreSQL, OpenAI embeddings
       ↓
  [Analyzer] — sentiment analysis, keyword themes, trends
       ↓
  [Summarizer] — OpenAI tool-use API for structured executive brief
       ↓
  [RAG Agent] — pgvector retrieval + 3-layer guardrail + OpenAI chat
```

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | **Next.js API Routes (TypeScript)** |
| Database | Supabase PostgreSQL + pgvector |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) |
| AI Model | GPT-4o-mini (default) via OpenAI API |
| Sentiment | `sentiment` npm package (AFINN-based) |
| Themes | Keyword frequency analysis |
| Frontend | Next.js 14 App Router + Tailwind CSS + Recharts |
| Deployment | **Vercel (unified frontend + backend)** |

## Backend Migration: Python to TypeScript

> **March 2026**: The backend was converted from Python/FastAPI to Next.js API Routes for unified Vercel deployment.

### Why the Migration?

- **Unified deployment** — Single Vercel deployment instead of separate Render (backend) + Vercel (frontend)
- **Free tier optimization** — Eliminates need for separate backend hosting
- **Simplified architecture** — No CORS configuration, no separate environment management
- **Better DX** — Single codebase, shared types, instant deployments

### What Changed

| Component | Python (Before) | TypeScript (After) |
|-----------|-----------------|-------------------|
| Framework | FastAPI + uvicorn | Next.js API Routes |
| Scraper | `httpx` + `beautifulsoup4` | `fetch` + `cheerio` |
| Sentiment | VADER (`vaderSentiment`) | `sentiment` (AFINN) |
| Embeddings | `sentence-transformers` (local) | OpenAI API |
| Themes | `scikit-learn` TF-IDF + KMeans | Keyword frequency |
| Database | SQLAlchemy + asyncpg | `@supabase/supabase-js` |
| Migrations | Alembic | Supabase Migrations |

### New File Structure

```
lib/
├── supabase.ts          # Database client + types
├── openai.ts            # OpenAI client + embeddings
├── api.ts               # Frontend API helpers
├── pipeline/
│   ├── scraper.ts       # Trustpilot scraper + CSV parser
│   ├── analyzer.ts      # Sentiment + themes + trends
│   └── summarizer.ts    # OpenAI tool-use summarization
└── agents/
    ├── guardrails.ts    # 3-layer guardrail system
    └── rag-agent.ts     # RAG with vector search

app/api/
├── ingest/route.ts      # POST: Scrape/parse reviews
├── analyze/[projectId]/route.ts  # POST: Run analysis
├── chat/route.ts        # POST: Guardrailed Q&A
└── projects/[id]/
    ├── route.ts         # GET: Project details
    └── reviews/route.ts # GET: Paginated reviews
```

### Legacy Python Backend

The original Python backend remains in `/backend/` for reference but is no longer used. Key files:
- `backend/app/main.py` — FastAPI app
- `backend/app/pipeline/` — Scraper, analyzer, summarizer
- `backend/app/agents/` — RAG agent, guardrails
- `backend/requirements.txt` — Python dependencies
- `backend/Dockerfile` — Container config for Render

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project with pgvector extension
- OpenAI API key

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file:

```bash
# Supabase (auto-configured via v0 integration)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-...
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Schema

Tables are created via Supabase migrations:

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  trustpilot_url TEXT,
  total_reviews INTEGER DEFAULT 0,
  overall_rating DECIMAL(3, 2),
  summary_generated BOOLEAN DEFAULT FALSE,
  summary_text TEXT,
  themes TEXT[] DEFAULT ARRAY[]::TEXT[],
  sentiment_distribution JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews table with vector embeddings
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  title TEXT,
  rating INTEGER,
  author TEXT,
  created_date TIMESTAMPTZ,
  sentiment_score DECIMAL(3, 2),
  sentiment_label TEXT,
  themes TEXT[] DEFAULT ARRAY[]::TEXT[],
  body_hash TEXT UNIQUE NOT NULL,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Features

- **Scraper**: Trustpilot `__NEXT_DATA__` extraction + JSON-LD fallback + CSV upload
- **Deduplication**: SHA-256 hash of review body
- **Sentiment**: AFINN-based scoring with positive/negative/neutral labels
- **Theme extraction**: Keyword frequency analysis with filtering
- **Guardrailed chat**: 3-layer guardrail (regex pre-filter → system prompt → hallucination scan)
- **pgvector RAG**: Cosine similarity search over 1536-dim OpenAI embeddings
- **Auto-save transcripts**: Chat sessions saved to `/ai-transcripts/`

## Deployment

Deploy to Vercel with zero configuration:

```bash
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ingest` | Scrape URL or parse CSV, store reviews |
| POST | `/api/analyze/[projectId]` | Run sentiment, themes, summarization |
| POST | `/api/chat` | Guardrailed Q&A with sources |
| GET | `/api/projects/[id]` | Get project details |
| GET | `/api/projects/[id]/reviews` | Get paginated reviews |

## License

MIT
