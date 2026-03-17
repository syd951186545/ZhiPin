import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    # service_role 密钥用于后端 Storage 上传（绕过 RLS），从 Supabase Dashboard > Settings > API 获取
    supabase_service_key: str = ""

    # OpenClaw
    openclaw_base_url: str = "http://192.168.3.215:18789"
    openclaw_auth_token: str = ""
    openclaw_agent_id: str = "HR_Juzi"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # CORS: 逗号分隔的允许源列表，"*" 表示允许所有
    # Docker 部署时前端通过 nginx 同源访问，设为 "*" 即可
    cors_origins: str = "http://localhost:3000,http://0.0.0.0:3000"

    # Docker 共享卷：OpenClaw media 目录在后端容器中的挂载路径
    # 开发环境设为空字符串则回退到 HTTP fetch
    openclaw_media_mount: str = "/openclaw-media"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
