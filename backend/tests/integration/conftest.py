"""
集成测试 fixtures。

这套 fixtures 使用「真实」的 Supabase 和后端，不 mock 外部依赖。
测试前需设置以下环境变量：

  SUPABASE_URL              真实（测试环境）Supabase 项目 URL
  SUPABASE_ANON_KEY         Supabase anon key
  SUPABASE_SERVICE_KEY      Supabase service_role key（用于管理员直查 DB）
  OPENCLAW_BASE_URL         OpenClaw 测试实例 URL
  OPENCLAW_AUTH_TOKEN       OpenClaw auth token
  INTEGRATION_TENANT_ID     测试专用 tenant_id
  INTEGRATION_AUTH_TOKEN    测试用户的真实 Supabase JWT
  BACKEND_URL               运行中的后端地址（默认 http://localhost:8000）

任何必要变量缺失将导致整个集成测试套件被跳过（skip），不报错。
"""

from __future__ import annotations

import os
import uuid
from typing import AsyncGenerator

import httpx
import pytest
import pytest_asyncio

# ── 必要环境变量清单 ──────────────────────────────────────────

_REQUIRED_VARS = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "INTEGRATION_TENANT_ID",
    "INTEGRATION_AUTH_TOKEN",
]

_BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
_TEST_TENANT_ID = os.environ.get("INTEGRATION_TENANT_ID", "")
_TEST_AUTH_TOKEN = os.environ.get("INTEGRATION_AUTH_TOKEN", "")


def _check_env() -> str | None:
    """返回第一个缺失的环境变量名，若全部设置则返回 None。"""
    for var in _REQUIRED_VARS:
        if not os.environ.get(var):
            return var
    return None


# ── session 级跳过检查 ────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def require_integration_env():
    """集成测试套件级跳过：任何必要变量缺失就跳过整个套件。"""
    missing = _check_env()
    if missing:
        pytest.skip(
            f"集成测试跳过：环境变量 {missing} 未设置。"
            "请参考 backend/tests/integration/conftest.py 顶部注释配置测试环境。",
            allow_module_level=True,
        )


# ── 真实后端 HTTP 客户端 ──────────────────────────────────────

@pytest_asyncio.fixture
async def real_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """
    直连真实后端的 httpx 客户端，携带测试用户的 JWT。

    与 conftest.py 的 `client` fixture 不同：
    - 不使用 ASGI transport（调用真实运行的后端服务）
    - 使用真实 JWT（不 mock validate_supabase_user）
    - 后端会真正调用 Supabase 和 OpenClaw
    """
    headers = {
        "Authorization": f"Bearer {_TEST_AUTH_TOKEN}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(
        base_url=_BACKEND_URL,
        headers=headers,
        timeout=60.0,
    ) as client:
        yield client


# ── 真实 Supabase Admin 客户端 ────────────────────────────────

@pytest.fixture(scope="session")
def supabase_admin():
    """
    Supabase service_role 客户端，用于直接查询 DB 验证数据持久化。
    """
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


# ── 测试数据清理 ──────────────────────────────────────────────

_created_account_ids: list[str] = []


@pytest.fixture(autouse=True)
def track_created_accounts():
    """收集本测试创建的账号 ID，测试结束后清理。"""
    _created_account_ids.clear()
    yield
    # teardown：清理测试中创建的账号
    if _created_account_ids:
        try:
            from supabase import create_client
            url = os.environ.get("SUPABASE_URL", "")
            key = os.environ.get("SUPABASE_SERVICE_KEY", "")
            if url and key:
                client = create_client(url, key)
                for acc_id in _created_account_ids:
                    try:
                        client.table("platform_accounts").delete().eq("id", acc_id).execute()
                    except Exception:
                        pass
        except Exception:
            pass


def register_account_for_cleanup(account_id: str):
    """在集成测试中，将创建的账号 ID 注册到清理列表。"""
    _created_account_ids.append(account_id)


# ── 通用 payload helpers ──────────────────────────────────────

def test_account_payload(name_suffix: str = "") -> dict:
    """构造带 [TEST-AUTO] 前缀的账号 payload（便于识别和清理）。"""
    unique_suffix = name_suffix or str(uuid.uuid4())[:8]
    return {
        "name": f"[TEST-AUTO] 集成测试账号 {unique_suffix}",
        "platform": "boss_zhipin",
        "account_name": f"integration-test-{unique_suffix}",
    }


def workflow_start_payload(account_id: str) -> dict:
    """构造工作流启动 payload（使用 INTEGRATION_AUTH_TOKEN）。"""
    return {
        "workflow_id": "publish_job",
        "tenant_id": _TEST_TENANT_ID,
        "user_id": "integration-test-user",
        "platform": "boss_zhipin",
        "account_id": account_id,
        "job_title": "[TEST-AUTO] 集成测试岗位",
        "supabase_auth_token": _TEST_AUTH_TOKEN,
    }
