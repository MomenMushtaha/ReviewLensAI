from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, set_embedder
import subprocess


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Alembic migrations
    subprocess.run(["alembic", "upgrade", "head"], check=True)

    # Load sentence-transformers embedder
    from sentence_transformers import SentenceTransformer
    embedder = SentenceTransformer(settings.embedding_model)
    set_embedder(embedder)

    yield

    await engine.dispose()


app = FastAPI(title="ReviewLens AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import projects, pipeline, chat  # noqa: E402

app.include_router(projects.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(chat.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
