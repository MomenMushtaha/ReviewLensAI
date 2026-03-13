from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pgvector.sqlalchemy import Vector  # noqa: F401 — registers the type
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


# Embedder singleton — loaded once in lifespan
_embedder = None


def get_embedder():
    return _embedder


def set_embedder(model):
    global _embedder
    _embedder = model


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
