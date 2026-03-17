import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # OpenClaw
    openclaw_base_url: str = "http://192.168.3.215:18789"
    openclaw_auth_token: str = ""
    openclaw_agent_id: str = "HR_Juzi"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
