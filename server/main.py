"""
智聘云 FastAPI 后端入口

提供 LangGraph 工作流编排服务，协调 OpenClaw 浏览器自动化与 Supabase 数据持久化。
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers.workflow import router as workflow_router
from routers.openclaw_proxy import router as openclaw_proxy_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(f"OpenClaw: {settings.openclaw_base_url}")
    logger.info(f"Supabase: {settings.supabase_url[:40]}...")
    yield
    logger.info("Server shutting down")


app = FastAPI(
    title="智聘云 Workflow API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - 从配置读取允许源，支持 "*" 通配
_settings = get_settings()
_cors_origins = (
    ["*"] if _settings.cors_origins.strip() == "*"
    else [o.strip() for o in _settings.cors_origins.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 路由
app.include_router(workflow_router)
app.include_router(openclaw_proxy_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "zhipin-workflow"}


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)
