from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from services.openclaw_client import StepResult
from services.platform_binding_service import _execute_openclaw_with_retries


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
