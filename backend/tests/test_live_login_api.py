"""
live_login API 端点测试。

覆盖：start, confirm, stop, status, concurrent limit。
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import FAKE_TOKEN, auth_header

# Mock LiveSession 工厂
def _make_mock_session(**overrides):
    defaults = {
        "session_id": "ls-001",
        "account_id": "acc-001",
        "tenant_id": "tenant-001",
        "platform": "boss_zhipin",
        "browser_session_key": "key-001",
        "display": 10,
        "ws_port": 6800,
        "cdp_port": 9220,
        "vnc_token": "abc123token",
        "started_at": 1700000000.0,
        "login_url": "https://www.zhipin.com/web/geek/job",
        "pids": {},
    }
    defaults.update(overrides)
    mock = MagicMock()
    for k, v in defaults.items():
        setattr(mock, k, v)
    return mock


MOCK_SESSION = _make_mock_session()

SAMPLE_ACCOUNT = {
    "id": "acc-001",
    "tenant_id": "tenant-001",
    "platform": "boss_zhipin",
    "browser_session_key": "key-001",
}


# ── POST /api/live-login/start ─────────────────────────────────


@pytest.mark.asyncio
async def test_start_success(client):
    """正常启动返回会话信息。"""
    with (
        patch("routers.live_login.get_platform_account", new_callable=AsyncMock, return_value=SAMPLE_ACCOUNT),
        patch("routers.live_login.start_live_session", new_callable=AsyncMock, return_value=MOCK_SESSION),
        patch("routers.live_login.update_platform_account", new_callable=AsyncMock),
    ):
        resp = await client.post(
            "/api/live-login/start",
            json={"account_id": "acc-001"},
            headers=auth_header(),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == "ls-001"
    assert data["ws_port"] == 6800
    assert data["vnc_token"] == "abc123token"


@pytest.mark.asyncio
async def test_start_account_not_found(client):
    """账号不存在返回 404。"""
    with patch("routers.live_login.get_platform_account", new_callable=AsyncMock, return_value=None):
        resp = await client.post(
            "/api/live-login/start",
            json={"account_id": "nonexist"},
            headers=auth_header(),
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_start_pool_exhausted(client):
    """通道满时返回 429。"""
    with (
        patch("routers.live_login.get_platform_account", new_callable=AsyncMock, return_value=SAMPLE_ACCOUNT),
        patch(
            "routers.live_login.start_live_session",
            new_callable=AsyncMock,
            side_effect=RuntimeError("登录通道已满（最多 2 个并发），请稍后重试"),
        ),
    ):
        resp = await client.post(
            "/api/live-login/start",
            json={"account_id": "acc-001"},
            headers=auth_header(),
        )
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_start_no_auth(client):
    """无认证返回 401。"""
    resp = await client.post(
        "/api/live-login/start",
        json={"account_id": "acc-001"},
    )
    assert resp.status_code == 401


# ── POST /api/live-login/{id}/confirm ──────────────────────────


@pytest.mark.asyncio
async def test_confirm_success(client):
    """确认登录成功。"""
    with (
        patch("routers.live_login.get_session", return_value=MOCK_SESSION),
        patch(
            "routers.live_login.confirm_login",
            new_callable=AsyncMock,
            return_value={"is_logged_in": True, "storage_state": {"cookies": []}},
        ),
    ):
        resp = await client.post(
            "/api/live-login/ls-001/confirm",
            headers=auth_header(),
        )
    assert resp.status_code == 200
    assert resp.json()["is_logged_in"] is True


@pytest.mark.asyncio
async def test_confirm_session_not_found(client):
    """会话不存在返回 404。"""
    with patch("routers.live_login.get_session", return_value=None):
        resp = await client.post(
            "/api/live-login/nonexist/confirm",
            headers=auth_header(),
        )
    assert resp.status_code == 404


# ── POST /api/live-login/{id}/stop ─────────────────────────────


@pytest.mark.asyncio
async def test_stop_success(client):
    """正常停止会话。"""
    with (
        patch("routers.live_login.get_session", return_value=MOCK_SESSION),
        patch("routers.live_login.update_platform_account", new_callable=AsyncMock),
        patch("routers.live_login.stop_live_session", new_callable=AsyncMock),
    ):
        resp = await client.post(
            "/api/live-login/ls-001/stop",
            headers=auth_header(),
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"


# ── GET /api/live-login/{id}/status ────────────────────────────


@pytest.mark.asyncio
async def test_status_active(client):
    """活跃会话返回状态信息。"""
    with (
        patch("routers.live_login.get_session", return_value=MOCK_SESSION),
        patch("routers.live_login.get_session_time_remaining", return_value=600.0),
    ):
        resp = await client.get(
            "/api/live-login/ls-001/status",
            headers=auth_header(),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] is True
    assert data["time_remaining"] == 600.0


@pytest.mark.asyncio
async def test_status_inactive(client):
    """已关闭会话返回非活跃状态。"""
    with patch("routers.live_login.get_session", return_value=None):
        resp = await client.get(
            "/api/live-login/ls-001/status",
            headers=auth_header(),
        )
    assert resp.status_code == 200
    assert resp.json()["active"] is False
