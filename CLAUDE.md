# ReviewLens AI — Project Context

## What This Is

A Review Intelligence Portal that ingests product reviews from Trustpilot (or CSV), runs a multi-stage analysis pipeline, and surfaces actionable insights through an interactive dashboard with a guardrailed AI chat assistant.

## Architecture

```
Frontend (Next.js 16, Vercel)
    ↕ REST + SSE
Backend (FastAPI, Render)
    ↕ asyncpg
PostgreSQL + pgvector (Docker local / managed prod)
    ↕ HTTP
OpenAI API (embeddings + GPT-4o-mini)
```

## Pipeline Stages

1. **Scraper** — Extracts reviews from Trustpilot via `__NEXT_DATA__` JSON with JSON-LD fallback. Deep mode (>200 reviews) uses Trustpilot's internal JSON API with adaptive rate-limit handling. Also accepts CSV upload with flexible column mapping.

2. **Ingester** — Cleans text (HTML strip, unicode normalization), deduplicates via SHA-256 hash per project, generates 384-dim embeddings via OpenAI `text-embedding-3-small`, stores in PostgreSQL with pgvector.

3. **Analyzer** — VADER sentiment with star-rating override, TF-IDF + KMeans theme clustering (2-8 themes), monthly rating trends, top/bottom review selection. Runs the 9-signal bias detection engine to compute a bias-adjusted rating.

4. **Summarizer** — Calls GPT-4o-mini with OpenAI tool-use/function-calling to produce structured JSON: executive summary, pain points, highlights, recommendations, and theme labels. Bias context is injected into the prompt so the summary accounts for detected biases.

## Key Design Decisions

- **Classical ML + LLM hybrid**: VADER, TF-IDF, KMeans run locally (free, fast, deterministic). OpenAI calls are reserved for the two places they earn their cost — structured summarization and RAG chat.
- **pgvector in PostgreSQL**: Single database for both relational data and vector search. No separate vector DB needed at this scale.
- **SSE for progress**: One-way server-to-client streaming. Simpler than WebSockets for unidirectional progress updates.
- **3-layer guardrails**: Pre-filter (regex), system prompt constraints, post-validation (hallucination check). Defense in depth against prompt injection and off-topic responses.
- **Bias-adjusted rating**: 9 statistical signals detect review biases (negativity bias, one-star dominance, platform context, etc.) and compute a transparent adjusted rating. All pure statistics — no additional LLM calls.

## Local Development

```bash
# Database
docker compose up -d
docker exec reviewlens-db psql -U reviewlens -d reviewlens -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # set OPENAI_API_KEY
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend && npm install
cp .env.local.example .env.local
npm run dev
```

## Deployment

- **Frontend**: Vercel (auto-deploys on push to main)
- **Backend**: Render Docker service (auto-deploys on push to main via render.yaml)
- **Database**: Any PostgreSQL 16+ with pgvector extension

## Code Map

```
backend/app/
├── pipeline/
│   ├── orchestrator.py    # 4-stage pipeline coordination + SSE events
│   ├── scraper.py         # Trustpilot HTML/JSON API + CSV parser
│   ├── ingester.py        # Dedup, embed, store reviews
│   ├── analyzer.py        # Sentiment, clustering, trends, bias detection
│   ├── summarizer.py      # OpenAI tool-use structured summarization
│   └── bias_detector.py   # 9-signal bias engine + adjusted rating
├── agents/
│   ├── rag_agent.py       # Vector search + LLM + source citations
│   └── guardrails.py      # 3-layer safety (pre-filter, prompt, post-validate)
├── routers/
│   ├── projects.py        # CRUD + analysis endpoint
│   ├── pipeline.py        # Pipeline trigger + SSE streaming + cancel
│   └── chat.py            # RAG chat endpoint
├── models/                # SQLAlchemy ORM (project, review, analysis)
├── schemas/               # Pydantic request/response models
└── config.py              # Settings from .env

frontend/
├── app/
│   ├── page.tsx           # Home — URL input, CSV upload, recent analyses
│   └── project/[id]/      # Dashboard — overview, reviews, themes, chat
├── components/
│   ├── BiasInsights.tsx    # Bias intelligence card with adjusted rating
│   ├── TrendChart.tsx      # Auto-scaled rating trend + volume bars
│   ├── ChatPanel.tsx       # RAG Q&A with follow-ups and guardrail display
│   └── ...                # SentimentChart, ThemeCard, ReviewTable, etc.
├── lib/api.ts             # API client
└── types/index.ts         # TypeScript interfaces
```
