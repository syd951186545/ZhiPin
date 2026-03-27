"""
共享测试 fixtures：mock 认证、mock Supabase、httpx AsyncClient。

设计原则：
- session 级注入环境变量，避免 main.py 导入时 get_settings() 失败
- function 级 mock 外部依赖，保证测试隔离
- autouse fixture 自动清理模块级内存状态
"""

from __future__ import annotations

import asyncio
import os
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

# ── 常量 ──────────────────────────────────────────────────

FAKE_TOKEN = "test-jwt-token-valid"
FAKE_USER = {"user_id": "user-001", "tenant_id": "tenant-001", "role": "admin"}


# ── 环境变量注入（session 级，最先执行） ──────────────────────

@pytest.fixture(scope="session", autouse=True)
def _set_test_env():
    """在任何 backend 模块导入之前注入必要的环境变量。"""
    env_vars = {
        "SUPABASE_URL": "https://fake.supabase.co",
        "SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZha2UiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxODAwMDAwMDAwfQ.fake-signature",
        "SUPABASE_SERVICE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZha2UiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE4MDAwMDAwMDB9.fake-signature",
        "OPENCLAW_BASE_URL": "http://localhost:9999",
        "OPENCLAW_AUTH_TOKEN": "fake-openclaw-token",
        "OPENCLAW_AGENT_ID": "fake-agent",
        "OPENCLAW_MEDIA_MOUNT": "/opt/openclaw-home/.openclaw/media",
        "OPENCLAW_HOME_MOUNT": "/opt/openclaw-home",
        "HOST": "0.0.0.0",
        "PORT": "8000",
        "DEBUG": "false",
        "CORS_ORIGINS": "*",
    }
    for k, v in env_vars.items():
        os.environ.setdefault(k, v)


# ── 清除 get_settings lru_cache（session 级） ────────────────

@pytest.fixture(scope="session", autouse=True)
def _clear_settings_cache(_set_test_env):
    """确保 get_settings() 使用测试环境变量。"""
    from config import get_settings
    get_settings.cache_clear()


# ── httpx AsyncClient fixture ────────────────────────────────

@pytest.fixture
async def client():
    """
    创建绑定到 FastAPI app 的 httpx AsyncClient。

    Mock：
    - validate_supabase_user → 返回 FAKE_USER
    - lifespan 中的后台清理任务
    """
    with (
        patch(
            "services.supabase_client.validate_supabase_user",
            new_callable=AsyncMock,
            return_value=FAKE_USER,
        ),
        patch(
            "routers.workflow.validate_supabase_user",
            new_callable=AsyncMock,
            return_value=FAKE_USER,
        ),
        patch(
            "routers.platform_accounts.validate_supabase_user",
            new_callable=AsyncMock,
            return_value=FAKE_USER,
        ),
        patch(
            "routers.live_login.validate_supabase_user",
            new_callable=AsyncMock,
            return_value=FAKE_USER,
        ),
        patch(
            "services.platform_binding_service.cleanup_orphaned_running_sessions",
        ),
        patch(
            "services.platform_binding_service.expire_stale_sessions_loop",
            new_callable=AsyncMock,
        ),
        patch(
            "services.live_login_service.cleanup_orphaned_sessions",
            return_value=0,
        ),
        patch(
            "services.live_login_service.cleanup_expired_sessions",
            new_callable=AsyncMock,
            return_value=0,
        ),
    ):
        from main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


# ── 辅助函数 ─────────────────────────────────────────────

def auth_header(token: str = FAKE_TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def auth_body(token: str = FAKE_TOKEN) -> dict[str, str]:
    return {"supabase_auth_token": token}


# ── 模块级状态自动清理 ──────────────────────────────────────

@pytest.fixture(autouse=True)
def _cleanup_workflow_state():
    """每个测试结束后清理 workflow 路由的内存状态。"""
    yield
    from routers.workflow import _event_queues, _cancelled, _running_tasks, _task_records
    _event_queues.clear()
    _cancelled.clear()
    _running_tasks.clear()
    _task_records.clear()


@pytest.fixture(autouse=True)
def _cleanup_binding_state():
    """每个测试结束后清理 binding service 的内存状态。"""
    yield
    try:
        from services.platform_binding_service import (
            _event_queues,
            _event_history,
            _running_tasks,
            _completed_sessions,
        )
        _event_queues.clear()
        _event_history.clear()
        _running_tasks.clear()
        _completed_sessions.clear()
    except ImportError:
        pass


# ── 示例数据 fixtures ────────────────────────────────────

@pytest.fixture
def sample_account() -> dict[str, Any]:
    return {
        "id": "acc-001",
        "tenant_id": "tenant-001",
        "platform": "boss_zhipin",
        "name": "Test Account",
        "account_name": "test_user",
        "platform_url": "https://www.zhipin.com/web/geek/job",
        "login_method": "phone",
        "browser_session_key": "session-key-001",
        "login_state": "LOGGED_IN",
        "login_identifier_masked": "138****0000",
        "last_error": None,
        "last_bind_task_id": None,
        "last_unbind_task_id": None,
        "config": {
            "platform_name": "BOSS直聘",
            "supported_login_methods": ["phone", "qr", "password"],
        },
        "is_connected": True,
        "status": "active",
        "last_verified": "2026-01-01T00:00:00Z",
        "last_login": "2026-01-01T00:00:00Z",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }


@pytest.fixture
def sample_binding_session() -> dict[str, Any]:
    return {
        "id": "sess-001",
        "account_id": "acc-001",
        "tenant_id": "tenant-001",
        "action": "bind",
        "status": "running",
        "step_key": "INIT",
        "openclaw_session_key": "session-key-001",
        "latest_screenshot_url": None,
        "qr_screenshot_url": None,
        "awaiting_payload_schema": None,
        "retry_count": 0,
        "error_message": None,
        "output_text": None,
        "expires_at": None,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }
