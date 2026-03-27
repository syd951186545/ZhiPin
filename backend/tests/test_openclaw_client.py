from __future__ import annotations

import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from services.openclaw_client import OpenClawClient, StepResult
from services.session_crypto import encrypt_storage_state


def _settings(tmp_path, **overrides):
    base = {
        "openclaw_base_url": "http://127.0.0.1:18789",
        "openclaw_browser_base_url": "http://127.0.0.1:18791",
        "openclaw_auth_token": "fake-openclaw-token",
        "openclaw_agent_id": "fake-agent",
        "openclaw_home_mount": str(tmp_path),
        "openclaw_media_mount": "/opt/openclaw-home/.openclaw/media",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_ensure_host_browser_ready_returns_error_when_gateway_config_unavailable(tmp_path):
    config_dir = tmp_path / ".openclaw"
    config_dir.mkdir(parents=True)
    (config_dir / "openclaw.json").write_text(
        '{"agents":{"defaults":{"model":{"primary":"demo/model"}}}}',
        encoding="utf-8",
    )

    mock_client_instance = AsyncMock()
    mock_client_instance.post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("services.openclaw_client.get_settings", return_value=_settings(tmp_path)),
        patch("services.openclaw_client.httpx.AsyncClient", return_value=mock_client_instance),
    ):
        client = OpenClawClient()
        result = await client.ensure_host_browser_ready(
            session_id="session-key-001",
            platform_url="https://example.com",
        )

    assert result.ready is False
    assert result.http_status == 503
    assert "读取 OpenClaw 运行时配置失败" in result.detail


@pytest.mark.asyncio
async def test_ensure_host_browser_ready_succeeds_after_smoke_test(tmp_path):
    config_dir = tmp_path / ".openclaw"
    config_dir.mkdir(parents=True)
    (config_dir / "openclaw.json").write_text(
        (
            '{"agents":{"defaults":{"model":{"primary":"demo/model"},'
            '"sandbox":{"browser":{"allowHostControl":true}}}}}'
        ),
        encoding="utf-8",
    )

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(
        return_value={
            "enabled": True,
            "driver": "openclaw",
            "running": True,
            "cdpReady": True,
            "chosenBrowser": "chromium",
        }
    )

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(return_value=mock_response)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("services.openclaw_client.get_settings", return_value=_settings(tmp_path)),
        patch("services.openclaw_client.httpx.AsyncClient", return_value=mock_client_instance),
        patch(
            "services.openclaw_client.OpenClawClient.execute_step",
            new=AsyncMock(
                return_value=StepResult(
                    success=True,
                    accumulated_text="[BROWSER_READY:OK]\n[BROWSER_REASON:host browser 可用]",
                )
            ),
        ),
    ):
        client = OpenClawClient()
        result = await client.ensure_host_browser_ready(
            session_id="session-key-001",
            platform_url="https://example.com",
        )

    assert result.ready is True
    assert result.detail == "host browser 可用"


@pytest.mark.asyncio
async def test_ensure_host_browser_ready_accepts_agent_sandbox_off_without_gateway_patch(tmp_path):
    config_dir = tmp_path / ".openclaw"
    config_dir.mkdir(parents=True)
    (config_dir / "openclaw.json").write_text(
        (
            '{"agents":{"defaults":{"model":{"primary":"demo/model"}},'
            '"list":[{"id":"fake-agent","sandbox":{"mode":"off"}}]}}'
        ),
        encoding="utf-8",
    )

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(
        return_value={
            "enabled": True,
            "driver": "openclaw",
            "running": True,
            "cdpReady": True,
            "chosenBrowser": "chromium",
        }
    )

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(return_value=mock_response)
    mock_client_instance.post = AsyncMock()
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("services.openclaw_client.get_settings", return_value=_settings(tmp_path)),
        patch("services.openclaw_client.httpx.AsyncClient", return_value=mock_client_instance),
        patch(
            "services.openclaw_client.OpenClawClient.execute_step",
            new=AsyncMock(
                return_value=StepResult(
                    success=True,
                    accumulated_text="[BROWSER_READY:OK]\n[BROWSER_REASON:host browser 可用]",
                )
            ),
        ),
    ):
        client = OpenClawClient()
        result = await client.ensure_host_browser_ready(
            session_id="session-key-001",
            platform_url="https://example.com",
        )

    assert result.ready is True
    assert mock_client_instance.post.await_count == 0


@pytest.mark.asyncio
async def test_ensure_host_browser_ready_accepts_logged_in_marker_from_browser_precheck(tmp_path):
    config_dir = tmp_path / ".openclaw"
    config_dir.mkdir(parents=True)
    (config_dir / "openclaw.json").write_text(
        (
            '{"agents":{"defaults":{"model":{"primary":"demo/model"}},'
            '"list":[{"id":"fake-agent","sandbox":{"mode":"off"}}]}}'
        ),
        encoding="utf-8",
    )

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(
        return_value={
            "enabled": True,
            "driver": "openclaw",
            "running": True,
            "cdpReady": True,
            "chosenBrowser": "chromium",
            "cdpUrl": "http://127.0.0.1:18800",
        }
    )

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(return_value=mock_response)
    mock_client_instance.post = AsyncMock()
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("services.openclaw_client.get_settings", return_value=_settings(tmp_path)),
        patch("services.openclaw_client.httpx.AsyncClient", return_value=mock_client_instance),
        patch(
            "services.openclaw_client.OpenClawClient._restore_persisted_session",
            new=AsyncMock(return_value=SimpleNamespace(ready=True, detail="ok", status_snapshot={})),
        ),
        patch(
            "services.openclaw_client.OpenClawClient.execute_step",
            new=AsyncMock(
                return_value=StepResult(
                    success=True,
                    accumulated_text="[LOGIN_STATE:LOGGED_IN]\n[LOGIN_REASON:已登录企业VIP]",
                )
            ),
        ),
    ):
        client = OpenClawClient()
        result = await client.ensure_host_browser_ready(
            session_id="session-key-001",
            platform_url="https://example.com",
        )

    assert result.ready is True


@pytest.mark.asyncio
async def test_ensure_host_browser_ready_starts_browser_before_smoke_test(tmp_path):
    config_dir = tmp_path / ".openclaw"
    config_dir.mkdir(parents=True)
    (config_dir / "openclaw.json").write_text(
        (
            '{"agents":{"defaults":{"model":{"primary":"demo/model"},'
            '"sandbox":{"browser":{"allowHostControl":true}}}}}'
        ),
        encoding="utf-8",
    )

    stopped_response = MagicMock()
    stopped_response.raise_for_status = MagicMock()
    stopped_response.json = MagicMock(
        return_value={
            "enabled": True,
            "running": False,
            "cdpReady": False,
            "chosenBrowser": None,
        }
    )
    ready_response = MagicMock()
    ready_response.raise_for_status = MagicMock()
    ready_response.json = MagicMock(
        return_value={
            "enabled": True,
            "running": True,
            "cdpReady": True,
            "chosenBrowser": "chromium",
        }
    )
    start_response = MagicMock()
    start_response.raise_for_status = MagicMock()
    start_response.json = MagicMock(return_value={"ok": True})

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(side_effect=[stopped_response, ready_response])
    mock_client_instance.post = AsyncMock(return_value=start_response)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("services.openclaw_client.get_settings", return_value=_settings(tmp_path)),
        patch("services.openclaw_client.httpx.AsyncClient", return_value=mock_client_instance),
        patch(
            "services.openclaw_client.OpenClawClient.execute_step",
            new=AsyncMock(
                return_value=StepResult(
                    success=True,
                    accumulated_text="[BROWSER_READY:OK]\n[BROWSER_REASON:host browser 可用]",
                )
            ),
        ),
    ):
        client = OpenClawClient()
        result = await client.ensure_host_browser_ready(
            session_id="session-key-001",
            platform_url="https://example.com",
        )

    assert result.ready is True
    assert mock_client_instance.post.await_count == 1
    called_url = mock_client_instance.post.await_args.args[0]
    assert called_url.endswith("/start")


@pytest.mark.asyncio
async def test_ensure_host_browser_ready_returns_clear_error_when_headless_is_missing(tmp_path):
    config_dir = tmp_path / ".openclaw"
    config_dir.mkdir(parents=True)
    (config_dir / "openclaw.json").write_text(
        (
            '{"agents":{"defaults":{"model":{"primary":"demo/model"},'
            '"sandbox":{"browser":{"allowHostControl":true}}}}}'
        ),
        encoding="utf-8",
    )

    stopped_response = MagicMock()
    stopped_response.raise_for_status = MagicMock()
    stopped_response.json = MagicMock(
        return_value={
            "enabled": True,
            "running": False,
            "cdpReady": False,
            "chosenBrowser": None,
        }
    )
    start_response = MagicMock()
    start_response.raise_for_status = MagicMock()
    start_response.json = MagicMock(
        return_value={
            "error": "Missing X server or $DISPLAY",
        }
    )

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(return_value=stopped_response)
    mock_client_instance.post = AsyncMock(return_value=start_response)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("services.openclaw_client.get_settings", return_value=_settings(tmp_path)),
        patch("services.openclaw_client.httpx.AsyncClient", return_value=mock_client_instance),
    ):
        client = OpenClawClient()
        result = await client.ensure_host_browser_ready(
            session_id="session-key-001",
            platform_url="https://example.com",
        )

    assert result.ready is False
    assert "headless" in result.detail


def test_load_persisted_storage_state_prefers_database_and_syncs_workspace(tmp_path):
    storage_state = {
        "cookies": [{"name": "auth", "value": "token", "domain": ".example.com", "path": "/"}],
        "origins": [{"origin": "https://example.com", "localStorage": [{"name": "k", "value": "v"}]}],
    }
    ciphertext = encrypt_storage_state(json.dumps(storage_state, ensure_ascii=False), key=b"a" * 32)
    encoded = base64.b64encode(ciphertext).decode("utf-8")

    with (
        patch.dict("os.environ", {"SESSION_ENCRYPTION_KEY": "61" * 32}, clear=False),
        patch("services.openclaw_client.get_settings", return_value=_settings(tmp_path)),
    ):
        client = OpenClawClient()
        payload, source = client._load_persisted_storage_state("session-key-001", encoded)

    assert source == "database"
    assert payload == storage_state
    assert (tmp_path / ".openclaw" / "workspace" / "session-key-001" / "storage_state.json").exists()


@pytest.mark.asyncio
async def test_ensure_host_browser_ready_restores_persisted_session_with_host_profile(tmp_path):
    config_dir = tmp_path / ".openclaw"
    config_dir.mkdir(parents=True)
    (config_dir / "openclaw.json").write_text(
        (
            '{"agents":{"defaults":{"model":{"primary":"demo/model"}},'
            '"list":[{"id":"fake-agent","sandbox":{"mode":"off"}}]}}'
        ),
        encoding="utf-8",
    )

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(
        return_value={
            "enabled": True,
            "driver": "openclaw",
            "running": True,
            "cdpReady": True,
            "chosenBrowser": "chromium",
            "cdpUrl": "http://127.0.0.1:18800",
        }
    )

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(return_value=mock_response)
    mock_client_instance.post = AsyncMock()
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("services.openclaw_client.get_settings", return_value=_settings(tmp_path)),
        patch("services.openclaw_client.httpx.AsyncClient", return_value=mock_client_instance),
        patch(
            "services.openclaw_client.OpenClawClient._restore_persisted_session",
            new=AsyncMock(return_value=SimpleNamespace(ready=True, detail="ok", status_snapshot={})),
        ) as mock_restore,
        patch(
            "services.openclaw_client.OpenClawClient.execute_step",
            new=AsyncMock(
                return_value=StepResult(
                    success=True,
                    accumulated_text="[BROWSER_READY:OK]\n[BROWSER_REASON:host browser 可用]",
                )
            ),
        ),
    ):
        client = OpenClawClient()
        result = await client.ensure_host_browser_ready(
            session_id="session-key-001",
            platform_url="https://example.com",
            encrypted_session_state="ciphertext",
        )

    assert result.ready is True
    mock_restore.assert_awaited_once()
    _, kwargs = mock_restore.await_args
    assert kwargs["session_id"] == "session-key-001"
    assert kwargs["profile"] == "openclaw"
    assert kwargs["encrypted_session_state"] == "ciphertext"
