from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pgvector.sqlalchemy import Vector  # noqa: F401 — registers the type
from openai import AsyncOpenAI
from app.config import settings

engine = create_async_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


class OpenAIEmbedder:
    """Async wrapper around OpenAI embeddings API."""

    def __init__(self, api_key: str, model: str, dimensions: int):
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model
        self._dimensions = dimensions

    async def encode(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.embeddings.create(
            input=texts,
            model=self._model,
            dimensions=self._dimensions,
        )
        return [d.embedding for d in resp.data]


_embedder: OpenAIEmbedder | None = None


def get_embedder() -> OpenAIEmbedder | None:
    return _embedder


def set_embedder(embedder: OpenAIEmbedder):
    global _embedder
    _embedder = embedder


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
