from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase / Database
    database_url: str
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # AI
    openai_api_key: str
    openai_model: str = "gpt-4o-mini"

    # App
    env: str = "development"
    allowed_origins: str = "http://localhost:3000"

    # Scraper
    scraper_max_pages: int = 10
    scraper_concurrency: int = 3

    # ML
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 384
    similarity_threshold: float = 0.20
    max_chat_history_turns: int = 6

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
