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

# CORS - 允许前端 dev server 访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://0.0.0.0:3000"],
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
