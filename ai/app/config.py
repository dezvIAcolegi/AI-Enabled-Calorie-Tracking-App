from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Empty defaults so the stubs run without keys.
    gemini_api_key: str = ""
    fdc_api_key: str = ""
    supabase_url: str = ""
    supabase_jwt_secret: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
