from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env.production"


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_anon_key: str
    # service_role 密钥仅用于后端 Storage 上传兜底场景，从 Supabase Dashboard > Settings > API 获取
    supabase_service_key: str

    @field_validator("supabase_service_key", "supabase_url", "supabase_anon_key", mode="before")
    @classmethod
    def strip_whitespace(cls, v: object) -> object:
        """防止 .env 中写入带引号的空白字符串（如 "   "）被误判为有效 token。"""
        return v.strip() if isinstance(v, str) else v

    # OpenClaw
    openclaw_base_url: str
    openclaw_auth_token: str
    openclaw_agent_id: str
    openclaw_media_mount: str
    openclaw_home_mount: str = "/openclaw-home"

    # Server
    host: str
    port: int
    debug: bool

    # CORS: 逗号分隔的允许源列表，"*" 表示允许所有
    # Docker 部署时前端通过 nginx 同源访问，设为 "*" 即可
    cors_origins: str

    model_config = {"env_file": str(ENV_FILE), "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
