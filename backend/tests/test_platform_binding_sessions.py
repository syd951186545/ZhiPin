"""
绑定会话 API 测试。

覆盖：submit, get, refresh-qr, stream
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import FAKE_TOKEN, auth_body, auth_header


# ── GET /api/platform-binding-sessions/{id} ──────────────────


@pytest.mark.asyncio
async def test_get_session_success(client, sample_binding_session):
    """正常获取会话详情。"""
    with patch("routers.platform_accounts.get_binding_session_snapshot", return_value=sample_binding_session):
        resp = await client.get("/api/platform-binding-sessions/sess-001", headers=auth_header())
    assert resp.status_code == 200
    assert resp.json()["item"]["id"] == "sess-001"


@pytest.mark.asyncio
async def test_get_session_not_found(client):
    """会话不存在返回 404。"""
    with patch("routers.platform_accounts.get_binding_session_snapshot", return_value=None):
        resp = await client.get("/api/platform-binding-sessions/nonexist", headers=auth_header())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_session_no_auth(client):
    """无 Bearer header 返回 401。"""
    resp = await client.get("/api/platform-binding-sessions/sess-001")
    assert resp.status_code == 401


# ── POST /api/platform-binding-sessions/{id}/refresh-qr ──────


@pytest.mark.asyncio
async def test_refresh_qr_success(client, sample_account, sample_binding_session):
    """刷新二维码成功返回新 URL。"""
    qr_session = {**sample_binding_session, "status": "awaiting_qr"}
    with (
        patch("routers.platform_accounts.get_binding_session", return_value=qr_session),
        patch("routers.platform_accounts.get_platform_account", return_value=sample_account),
        patch(
            "routers.platform_accounts.refresh_qr_session",
            new_callable=AsyncMock,
            return_value="https://example.com/new-qr.png",
        ),
    ):
        resp = await client.post("/api/platform-binding-sessions/sess-001/refresh-qr", json=auth_body())
    assert resp.status_code == 200
    assert resp.json()["qr_screenshot_url"] == "https://example.com/new-qr.png"


@pytest.mark.asyncio
async def test_refresh_qr_wrong_status(client, sample_binding_session):
    """非 awaiting_qr 状态刷新返回 400。"""
    running_session = {**sample_binding_session, "status": "running"}
    with patch("routers.platform_accounts.get_binding_session", return_value=running_session):
        resp = await client.post("/api/platform-binding-sessions/sess-001/refresh-qr", json=auth_body())
    assert resp.status_code == 400
    assert "不支持刷新二维码" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_refresh_qr_session_not_found(client):
    """会话不存在返回 404。"""
    with patch("routers.platform_accounts.get_binding_session", return_value=None):
        resp = await client.post("/api/platform-binding-sessions/nonexist/refresh-qr", json=auth_body())
    assert resp.status_code == 404


# ── GET /api/platform-binding-sessions/{id}/stream ───────────


@pytest.mark.asyncio
async def test_stream_no_token(client):
    """缺少 token query param 返回 401。"""
    resp = await client.get("/api/platform-binding-sessions/sess-001/stream")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_stream_returns_sse_content_type(client, sample_binding_session):
    """正常请求返回 text/event-stream。"""

    async def fake_stream(session_id):
        yield {"event": "meta", "data": {"session_id": session_id}}

    with (
        patch("routers.platform_accounts.get_binding_session", return_value=sample_binding_session),
        patch("routers.platform_accounts.stream_binding_events", side_effect=fake_stream),
    ):
        resp = await client.get(f"/api/platform-binding-sessions/sess-001/stream?token={FAKE_TOKEN}")
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")
