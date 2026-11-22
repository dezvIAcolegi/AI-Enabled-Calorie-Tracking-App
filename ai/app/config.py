from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Empty defaults so the app starts without keys; auth rejects every request until supabase_url is set.
    gemini_api_key: str = ""
    supabase_url: str = ""  # https://<ref>.supabase.co, not secret
    # Publishable key; foods search runs with the caller's token, so RLS applies.
    supabase_anon_key: str = ""

    @property
    def supabase_issuer(self) -> str:
        return self.supabase_url.rstrip("/") + "/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return self.supabase_issuer + "/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
