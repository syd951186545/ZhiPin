"""live_login_service 单元测试。

通过 mock 外部依赖（子进程、文件系统、playwright），
测试会话生命周期管理、display 池、超时清理等核心逻辑。
"""

from __future__ import annotations

import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

@pytest.fixture(autouse=True)
def _reset_module_state():
    """每个测试前重置模块级全局状态。"""
    import services.live_login_service as svc
    svc._active_sessions.clear()
    svc._display_pool[:] = list(range(svc._DISPLAY_BASE, svc._DISPLAY_BASE + svc.MAX_CONCURRENT))
    svc._lock = asyncio.Lock()
    yield
    svc._active_sessions.clear()


@pytest.fixture
def mock_deps():
    """批量 mock 外部依赖。"""
    with (
        patch("services.live_login_service.try_acquire_browser_mutex", return_value=True) as m1,
        patch("services.live_login_service.release_browser_mutex") as m2,
        patch("services.live_login_service._start_process_chain", new_callable=AsyncMock) as m3,
        patch("services.live_login_service._cleanup_session", new_callable=AsyncMock) as m4,
        patch("services.live_login_service._write_pid_file") as m5,
    ):
        yield {
            "services.live_login_service.try_acquire_browser_mutex": m1,
            "services.live_login_service.release_browser_mutex": m2,
            "services.live_login_service._start_process_chain": m3,
            "services.live_login_service._cleanup_session": m4,
            "services.live_login_service._write_pid_file": m5,
        }


# ── start_live_session ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_start_happy_path(mock_deps):
    """正常启动返回有效 LiveSession。"""
    from services.live_login_service import start_live_session

    session = await start_live_session(
        account_id="acc-1",
        tenant_id="t-1",
        platform="boss_zhipin",
        browser_session_key="key-1",
    )

    assert session.session_id
    assert session.account_id == "acc-1"
    assert session.ws_port > 0
    assert session.vnc_token
    assert session.display >= 10


@pytest.mark.asyncio
async def test_start_pool_exhausted(mock_deps):
    """display 池耗尽后应抛出 RuntimeError。"""
    from services.live_login_service import start_live_session, MAX_CONCURRENT

    sessions = []
    for i in range(MAX_CONCURRENT):
        s = await start_live_session(
            account_id=f"acc-{i}",
            tenant_id=f"t-{i}",
            platform="boss_zhipin",
            browser_session_key=f"key-{i}",
        )
        sessions.append(s)

    with pytest.raises(RuntimeError, match="通道已满"):
        await start_live_session(
            account_id="acc-overflow",
            tenant_id="t-overflow",
            platform="boss_zhipin",
            browser_session_key="key-overflow",
        )


@pytest.mark.asyncio
async def test_start_mutex_conflict(mock_deps):
    """浏览器互斥锁冲突应抛出 RuntimeError。"""
    mock_deps["services.live_login_service.try_acquire_browser_mutex"].return_value = False
    from services.live_login_service import start_live_session

    with pytest.raises(RuntimeError, match="正在被其他操作使用"):
        await start_live_session(
            account_id="acc-1",
            tenant_id="t-1",
            platform="boss_zhipin",
            browser_session_key="key-conflict",
        )


@pytest.mark.asyncio
async def test_start_process_chain_failure():
    """进程链启动失败应清理并抛出异常。"""
    from services.live_login_service import start_live_session

    with (
        patch("services.live_login_service.try_acquire_browser_mutex", return_value=True),
        patch("services.live_login_service.release_browser_mutex"),
        patch(
            "services.live_login_service._start_process_chain",
            new_callable=AsyncMock,
            side_effect=RuntimeError("Xvfb crashed"),
        ),
        patch(
            "services.live_login_service._cleanup_session",
            new_callable=AsyncMock,
        ) as mock_cleanup,
        patch("services.live_login_service._write_pid_file"),
    ):
        with pytest.raises(RuntimeError, match="Xvfb crashed"):
            await start_live_session(
                account_id="acc-1",
                tenant_id="t-1",
                platform="boss_zhipin",
                browser_session_key="key-fail",
            )
        mock_cleanup.assert_called_once()


# ── confirm_login ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_confirm_logged_in(mock_deps, monkeypatch):
    """确认登录成功场景。"""
    monkeypatch.setenv("SESSION_ENCRYPTION_KEY", "a" * 64)
    from services.live_login_service import start_live_session, confirm_login

    session = await start_live_session(
        account_id="acc-1", tenant_id="t-1",
        platform="boss_zhipin", browser_session_key="key-1",
    )

    mock_state = {
        "cookies": [{"name": "wt2", "value": "abc", "domain": ".zhipin.com"}],
        "origins": [],
    }

    with (
        patch(
            "services.live_login_service._extract_and_verify_storage_state",
            new_callable=AsyncMock,
            return_value=(mock_state, True),
        ),
        patch("services.live_login_service._write_storage_state_to_workspace"),
        patch(
            "services.live_login_service._verify_storage_state_persisted",
            return_value=(True, "ok"),
        ),
    ):
        updater = AsyncMock()
        result = await confirm_login(session.session_id, supabase_updater=updater)

    assert result["is_logged_in"] is True
    assert result["storage_state"] == mock_state
    assert result["persistence"]["workspace_saved"] is True
    updater.assert_awaited_once()


@pytest.mark.asyncio
async def test_confirm_not_logged_in(mock_deps):
    """确认登录失败场景（未检测到 cookie）。"""
    from services.live_login_service import start_live_session, confirm_login

    session = await start_live_session(
        account_id="acc-1", tenant_id="t-1",
        platform="boss_zhipin", browser_session_key="key-1",
    )

    with patch(
        "services.live_login_service._extract_and_verify_storage_state",
        new_callable=AsyncMock,
        return_value=({"cookies": [], "origins": []}, False),
    ):
        result = await confirm_login(session.session_id)

    assert result["is_logged_in"] is False


@pytest.mark.asyncio
async def test_confirm_logged_in_but_persistence_failed(mock_deps, monkeypatch):
    """检测到登录态但持久化回读失败时，应返回未登录。"""
    monkeypatch.setenv("SESSION_ENCRYPTION_KEY", "a" * 64)
    from services.live_login_service import start_live_session, confirm_login

    session = await start_live_session(
        account_id="acc-1", tenant_id="t-1",
        platform="boss_zhipin", browser_session_key="key-1",
    )

    mock_state = {
        "cookies": [{"name": "wt2", "value": "abc", "domain": ".zhipin.com"}],
        "origins": [],
    }

    with (
        patch(
            "services.live_login_service._extract_and_verify_storage_state",
            new_callable=AsyncMock,
            return_value=(mock_state, True),
        ),
        patch("services.live_login_service._write_storage_state_to_workspace"),
        patch(
            "services.live_login_service._verify_storage_state_persisted",
            return_value=(False, "file missing"),
        ),
    ):
        result = await confirm_login(session.session_id, supabase_updater=AsyncMock())

    assert result["is_logged_in"] is False
    assert result["persistence"]["workspace_saved"] is False


@pytest.mark.asyncio
async def test_confirm_nonexistent_session(mock_deps):
    """确认不存在的会话应抛出 KeyError。"""
    from services.live_login_service import confirm_login

    with pytest.raises(KeyError, match="不存在或已关闭"):
        await confirm_login("nonexistent-id")


# ── stop_live_session ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_stop_session(mock_deps):
    """停止会话后应从活跃列表移除。"""
    from services.live_login_service import start_live_session, stop_live_session, get_session

    session = await start_live_session(
        account_id="acc-1", tenant_id="t-1",
        platform="boss_zhipin", browser_session_key="key-1",
    )

    assert get_session(session.session_id) is not None
    await stop_live_session(session.session_id)
    assert get_session(session.session_id) is None


# ── cleanup_expired_sessions ──────────────────────────────────


@pytest.mark.asyncio
async def test_cleanup_expired(mock_deps):
    """超时会话应被清理。"""
    from services.live_login_service import (
        start_live_session, cleanup_expired_sessions, _active_sessions, SESSION_TIMEOUT,
    )

    session = await start_live_session(
        account_id="acc-1", tenant_id="t-1",
        platform="boss_zhipin", browser_session_key="key-1",
    )

    # 伪造超时
    _active_sessions[session.session_id].started_at = time.time() - SESSION_TIMEOUT - 10

    cleaned = await cleanup_expired_sessions()
    assert cleaned == 1
    assert session.session_id not in _active_sessions


# ── _check_login_cookies ──────────────────────────────────────


class TestCheckLoginCookies:
    def test_boss_zhipin_logged_in(self):
        from services.live_login_service import _check_login_cookies
        state = {"cookies": [{"name": "wt2", "value": "x", "domain": ".zhipin.com"}]}
        assert _check_login_cookies(state, "boss_zhipin") is True

    def test_boss_zhipin_not_logged_in(self):
        from services.live_login_service import _check_login_cookies
        state = {"cookies": [{"name": "other", "value": "x", "domain": ".zhipin.com"}]}
        assert _check_login_cookies(state, "boss_zhipin") is False

    def test_unknown_platform_trusts_user(self):
        from services.live_login_service import _check_login_cookies
        state = {"cookies": []}
        assert _check_login_cookies(state, "unknown_platform") is True

    def test_58_logged_in_by_auth_cookie_and_non_login_url(self):
        from services.live_login_service import _check_login_cookies
        state = {
            "cookies": [{"name": "PPU", "value": "x", "domain": ".58.com"}],
        }
        signals = {"urls": ["https://vip.58.com/index"], "titles": []}
        assert _check_login_cookies(state, "58", signals) is True

    def test_58_not_logged_in_when_only_tracking_cookie(self):
        from services.live_login_service import _check_login_cookies
        state = {
            "cookies": [{"name": "58tj_uuid", "value": "x", "domain": ".58.com"}],
        }
        signals = {"urls": ["https://passport.58.com/login/?path=http%3A%2F%2Fvip.58.com"], "titles": []}
        assert _check_login_cookies(state, "58", signals) is False
