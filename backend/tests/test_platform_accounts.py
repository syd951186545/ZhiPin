"""
平台账号 CRUD API 测试。

覆盖：GET/POST/DELETE /api/platform-accounts, bind/start, verify, unbind
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import FAKE_TOKEN, FAKE_USER, auth_body, auth_header


# ── GET /api/platform-accounts ──────────────────────────────


@pytest.mark.asyncio
async def test_list_accounts_success(client, sample_account):
    """正常认证时返回账号列表。"""
    with (
        patch("routers.platform_accounts.list_platform_accounts", return_value=[sample_account]),
        patch("routers.platform_accounts.attach_latest_binding_session", side_effect=lambda accs, *a, **kw: accs),
    ):
        resp = await client.get("/api/platform-accounts", headers=auth_header())
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 1


@pytest.mark.asyncio
async def test_list_accounts_no_auth(client):
    """缺少 Authorization header 应返回 401。"""
    resp = await client.get("/api/platform-accounts")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_accounts_invalid_token(client):
    """无效 token 应返回 401。"""
    with patch(
        "routers.platform_accounts.validate_supabase_user",
        new_callable=AsyncMock,
        side_effect=ValueError("token expired"),
    ):
        resp = await client.get("/api/platform-accounts", headers=auth_header("bad-token"))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_accounts_forbidden(client):
    """权限不足应返回 403。"""
    with patch(
        "routers.platform_accounts.validate_supabase_user",
        new_callable=AsyncMock,
        side_effect=PermissionError("access denied"),
    ):
        resp = await client.get("/api/platform-accounts", headers=auth_header())
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_accounts_empty(client):
    """无账号时返回空列表。"""
    with (
        patch("routers.platform_accounts.list_platform_accounts", return_value=[]),
        patch("routers.platform_accounts.attach_latest_binding_session", side_effect=lambda accs, *a, **kw: accs),
    ):
        resp = await client.get("/api/platform-accounts", headers=auth_header())
    assert resp.status_code == 200
    assert resp.json()["items"] == []


# ── POST /api/platform-accounts ──────────────────────────────


@pytest.mark.asyncio
async def test_create_account_success(client):
    """正常创建账号返回 item。"""
    created = {
        "id": "acc-new",
        "tenant_id": "tenant-001",
        "platform": "boss_zhipin",
        "name": "My Account",
        "browser_session_key": "",
    }
    updated = {**created, "browser_session_key": "tenant-001_boss_zhipin_acc-new"}

    with (
        patch("routers.platform_accounts.create_platform_account", return_value=created),
        patch("routers.platform_accounts.update_platform_account", return_value=updated),
        patch("routers.platform_accounts.build_browser_session_key", return_value="tenant-001_boss_zhipin_acc-new"),
    ):
        resp = await client.post("/api/platform-accounts", json={
            "platform": "boss_zhipin",
            "name": "My Account",
            **auth_body(),
        })
    assert resp.status_code == 200
    assert resp.json()["item"]["browser_session_key"] == "tenant-001_boss_zhipin_acc-new"


@pytest.mark.asyncio
async def test_create_account_no_token(client):
    """缺少 token 应返回 401。"""
    resp = await client.post("/api/platform-accounts", json={
        "platform": "boss_zhipin",
        "name": "Test",
        "supabase_auth_token": "",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_account_sets_browser_session_key(client):
    """创建后应调用 update_platform_account 设置 browser_session_key。"""
    created = {"id": "acc-x", "tenant_id": "tenant-001", "platform": "boss_zhipin", "name": "X"}
    mock_update = MagicMock(return_value={**created, "browser_session_key": "key-x"})

    with (
        patch("routers.platform_accounts.create_platform_account", return_value=created),
        patch("routers.platform_accounts.update_platform_account", mock_update),
        patch("routers.platform_accounts.build_browser_session_key", return_value="key-x"),
    ):
        await client.post("/api/platform-accounts", json={
            "platform": "boss_zhipin",
            "name": "X",
            **auth_body(),
        })
    mock_update.assert_called_once()
    call_args = mock_update.call_args
    assert call_args[0][2] == {"browser_session_key": "key-x"}


@pytest.mark.asyncio
async def test_create_account_unknown_platform(client):
    """未知平台应抛出 KeyError（后端未捕获此异常 — 这是一个潜在 bug）。"""
    with pytest.raises(KeyError, match="unknown_platform"):
        await client.post("/api/platform-accounts", json={
            "platform": "unknown_platform",
            "name": "Test",
            **auth_body(),
        })


# ── DELETE /api/platform-accounts/{id} ───────────────────────


@pytest.mark.asyncio
async def test_delete_account_success(client, sample_account):
    """正常删除返回 success。"""
    with (
        patch("routers.platform_accounts.get_platform_account", return_value=sample_account),
        patch("routers.platform_accounts.clear_session_artifacts"),
        patch("routers.platform_accounts.delete_platform_account"),
    ):
        resp = await client.delete("/api/platform-accounts/acc-001", headers=auth_header())
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_delete_account_not_found(client):
    """账号不存在应返回 404。"""
    with patch("routers.platform_accounts.get_platform_account", return_value=None):
        resp = await client.delete("/api/platform-accounts/nonexist", headers=auth_header())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_account_no_auth(client):
    """缺少 Bearer token 应返回 401。"""
    resp = await client.delete("/api/platform-accounts/acc-001")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_delete_clears_browser_session(client, sample_account):
    """删除账号时应清理浏览器会话工件。"""
    mock_clear = MagicMock()
    with (
        patch("routers.platform_accounts.get_platform_account", return_value=sample_account),
        patch("routers.platform_accounts.clear_session_artifacts", mock_clear),
        patch("routers.platform_accounts.delete_platform_account"),
    ):
        await client.delete("/api/platform-accounts/acc-001", headers=auth_header())
    mock_clear.assert_called_once_with("session-key-001")


@pytest.mark.asyncio
async def test_delete_no_session_key_skips_clear(client, sample_account):
    """browser_session_key 为空时不应调用 clear_session_artifacts。"""
    account_no_key = {**sample_account, "browser_session_key": ""}
    mock_clear = MagicMock()
    with (
        patch("routers.platform_accounts.get_platform_account", return_value=account_no_key),
        patch("routers.platform_accounts.clear_session_artifacts", mock_clear),
        patch("routers.platform_accounts.delete_platform_account"),
    ):
        await client.delete("/api/platform-accounts/acc-001", headers=auth_header())
    mock_clear.assert_not_called()


# ── POST /api/platform-accounts/{id}/verify ──────────────────


@pytest.mark.asyncio
async def test_verify_success(client, sample_account, sample_binding_session):
    """验证登录成功。"""
    verify_session = {**sample_binding_session, "action": "verify", "status": "completed"}
    with (
        patch("routers.platform_accounts.get_platform_account", return_value=sample_account),
        patch("routers.platform_accounts.start_verify_session", return_value=verify_session),
    ):
        resp = await client.post("/api/platform-accounts/acc-001/verify", json=auth_body())
    assert resp.status_code == 200
    assert resp.json()["item"]["action"] == "verify"


# ── POST /api/platform-accounts/{id}/unbind ──────────────────


@pytest.mark.asyncio
async def test_unbind_success(client, sample_account, sample_binding_session):
    """解绑成功。"""
    unbind_session = {**sample_binding_session, "action": "unbind", "status": "completed"}
    with (
        patch("routers.platform_accounts.get_platform_account", return_value=sample_account),
        patch("routers.platform_accounts.start_unbind_session", return_value=unbind_session),
    ):
        resp = await client.post("/api/platform-accounts/acc-001/unbind", json=auth_body())
    assert resp.status_code == 200
    assert resp.json()["item"]["action"] == "unbind"
