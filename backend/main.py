"""
机灵平台 FastAPI 后端入口

提供 LangGraph 工作流编排服务，协调 OpenClaw 浏览器自动化与 Supabase 数据持久化。
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from routers.workflow import router as workflow_router
from routers.runtime_artifacts import router as runtime_artifacts_router
from routers.workflow_templates import router as workflow_templates_router
from routers.openclaw_proxy import router as openclaw_proxy_router
from routers.settings import router as settings_router
from routers.platforms import router as platforms_router
from routers.platform_accounts import router as platform_accounts_router
from services.openclaw_health import probe_openclaw

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
    from services.platform_binding_service import expire_stale_sessions_loop, cleanup_orphaned_running_sessions
    import asyncio
    cleanup_orphaned_running_sessions()
    expire_task = asyncio.create_task(expire_stale_sessions_loop())
    yield
    expire_task.cancel()
    logger.info("Server shutting down")


app = FastAPI(
    title="机灵平台 Workflow API",
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
app.include_router(runtime_artifacts_router)
app.include_router(workflow_templates_router)
app.include_router(openclaw_proxy_router)
app.include_router(settings_router)
app.include_router(platforms_router)
app.include_router(platform_accounts_router)


@app.get("/api/health")
async def health():
    openclaw_status = await probe_openclaw()
    payload = {
        "status": "ok" if openclaw_status["status"] == "ok" else "degraded",
        "service": "jiling-platform-workflow",
        "backend": {"status": "ok"},
        "openclaw": openclaw_status,
    }
    if openclaw_status["status"] != "ok":
        return JSONResponse(status_code=503, content=payload)
    return payload


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)
