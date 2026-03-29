from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from prompts.platform_binding import build_correction_prompt, build_unbind_prompt, build_verify_prompt
from services.openclaw_client import StepResult
from services.platform_binding_service import _execute_openclaw_with_retries, _run_action


@pytest.mark.asyncio
async def test_execute_openclaw_with_retries_marks_timeout_as_failed(sample_account):
    async def slow_execute_step(**kwargs):
        await asyncio.sleep(0.05)
        return StepResult(success=True, accumulated_text="[LOGIN_STATE:LOGGED_IN]")

    with (
        patch("services.platform_binding_service.OPENCLAW_ACTION_TIMEOUT_SECONDS", 0.01),
        patch("services.platform_binding_service.OpenClawClient.execute_step", side_effect=slow_execute_step),
        patch("services.platform_binding_service.make_screenshot_uploader", return_value=None),
    ):
        result, parsed = await _execute_openclaw_with_retries(
            session_id="sess-timeout",
            account=sample_account,
            prompt="verify prompt",
            auth_token="token",
        )

    assert result.success is False
    assert "OpenClaw 执行超时" in (result.error or "")
    assert parsed is None


def test_correction_prompt_uses_runtime_browser_profile():
    prompt = build_correction_prompt(
        original_prompt="orig",
        attempt=2,
        last_error="timeout",
        last_state="FAILED",
        browser_profile="tenant-001-platform-boss-account-001-v1-abcdefghijklmnopqrstuvwxyz",
    )

    assert 'profile="sess-' in prompt
    assert 'profile="openclaw"' not in prompt


def test_verify_and_unbind_prompts_use_runtime_browser_profile():
    account = {
        "platform": "boss_zhipin",
        "platform_url": "https://www.zhipin.com/web/geek/job",
        "name": "Test Account",
        "login_identifier_masked": "138****0000",
        "browser_session_key": "tenant-001-platform-boss-account-acc-001-v1-abcdefghijklmnopqrstuvwxyz",
    }

    verify_prompt = build_verify_prompt(account)
    unbind_prompt = build_unbind_prompt(account)

    assert 'profile="sess-' in verify_prompt
    assert 'profile="sess-' in unbind_prompt
    assert 'profile="tenant-001-platform-boss-account-acc-001-v1-abcdefghijklmnopqrstuvwxyz"' not in verify_prompt
    assert 'profile="tenant-001-platform-boss-account-acc-001-v1-abcdefghijklmnopqrstuvwxyz"' not in unbind_prompt


@pytest.mark.asyncio
async def test_run_action_marks_verify_session_failed_when_browser_precheck_fails(sample_account, sample_binding_session):
    account = {
        **sample_account,
        "encrypted_session_state": "ciphertext",
        "status": "active",
    }
    binding_session = {
        **sample_binding_session,
        "action": "verify",
        "status": "running",
    }
    mock_update_binding_session = MagicMock()
    mock_update_platform_account = MagicMock()
    mock_emit = AsyncMock()

    with (
        patch("services.platform_binding_service.try_acquire_browser_mutex", return_value=True),
        patch("services.platform_binding_service.write_session_metadata"),
        patch(
            "services.platform_binding_service.ensure_verify_session_ready",
            new_callable=AsyncMock,
            return_value={
                "ready": False,
                "detail": "OpenClaw browser 服务不可达：All connection attempts failed",
                "http_status": 503,
                "status_snapshot": {},
            },
        ),
        patch("services.platform_binding_service.update_binding_session", mock_update_binding_session),
        patch("services.platform_binding_service.update_platform_account", mock_update_platform_account),
        patch("services.platform_binding_service.emit_binding_event", mock_emit),
        patch("services.platform_binding_service.release_browser_mutex"),
        patch("services.platform_binding_service._close_binding_stream"),
        patch("services.platform_binding_service._execute_openclaw_with_retries", new_callable=AsyncMock) as mock_execute,
    ):
        await _run_action(
            binding_session=binding_session,
            account=account,
            action="verify",
            prompt="verify prompt",
            tenant_id="tenant-001",
            auth_token="token",
        )

    mock_execute.assert_not_called()
    assert mock_update_binding_session.call_args_list[0].args[2]["status"] == "failed"
    assert mock_update_binding_session.call_args_list[0].args[2]["step_key"] == "BROWSER_READY_FAILED"
    assert mock_update_platform_account.call_args_list[0].args[2]["status"] == "active"
    assert mock_update_platform_account.call_args_list[0].args[2]["last_error"] is None
