from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from services.openclaw_client import StepResult
from workflows.base import StepDefinition, execute_step


def _base_state() -> dict:
    return {
        "execution_id": "exec-001",
        "session_id": "sess-001",
        "step_index": 0,
        "total_steps": 1,
        "step_results": {},
        "artifacts": [],
        "all_screenshots": [],
        "accumulated_text": "",
        "checkpoints": [],
        "_persisted_screenshots": [],
        "_pending_screenshot_uploads": [],
    }


def _step() -> StepDefinition:
    return StepDefinition(
        id="login_check",
        name_zh="检查登录",
        prompt_builder=lambda state: "prompt",
    )


@pytest.mark.asyncio
async def test_execute_step_prefers_cdp_capture_after_step():
    async def fake_cdp_capture(*, on_screenshot=None, **kwargs):
        if on_screenshot:
            await on_screenshot("/api/openclaw/screenshot?ref=cdp&sig=1")
        return StepResult(
            success=True,
            screenshots=["/api/openclaw/screenshot?ref=cdp&sig=1"],
            persisted_screenshots=["https://signed.example.com/cdp.png"],
        )

    openclaw = SimpleNamespace(
        execute_step=AsyncMock(return_value=StepResult(success=True, accumulated_text="[STEP_DONE:login_check]")),
        capture_host_browser_screenshot=AsyncMock(side_effect=fake_cdp_capture),
        capture_screenshot=AsyncMock(),
    )
    emit_event = AsyncMock()

    with patch("workflows.base.make_screenshot_uploader", return_value=None):
        state = await execute_step(_base_state(), _step(), openclaw, emit_event)
        await asyncio.sleep(0.05)

    openclaw.capture_host_browser_screenshot.assert_awaited_once()
    openclaw.capture_screenshot.assert_not_awaited()
    assert "https://signed.example.com/cdp.png" in state["_persisted_screenshots"]
    artifact_events = [
        call.args[2]
        for call in emit_event.await_args_list
        if len(call.args) >= 3 and call.args[1] == "artifact_created"
    ]
    assert artifact_events
    assert artifact_events[-1]["source"] == "host_browser_cdp"


@pytest.mark.asyncio
async def test_execute_step_falls_back_to_agent_capture_when_cdp_capture_fails():
    async def fake_agent_capture(*, on_screenshot=None, **kwargs):
        if on_screenshot:
            await on_screenshot("/api/openclaw/screenshot?ref=agent&sig=2")
        return StepResult(
            success=True,
            screenshots=["/api/openclaw/screenshot?ref=agent&sig=2"],
            persisted_screenshots=["https://signed.example.com/agent.png"],
        )

    openclaw = SimpleNamespace(
        execute_step=AsyncMock(return_value=StepResult(success=True, accumulated_text="[STEP_DONE:login_check]")),
        capture_host_browser_screenshot=AsyncMock(
            return_value=StepResult(success=False, error="CDP 截图失败：context closed")
        ),
        capture_screenshot=AsyncMock(side_effect=fake_agent_capture),
    )
    emit_event = AsyncMock()

    with patch("workflows.base.make_screenshot_uploader", return_value=None):
        state = await execute_step(_base_state(), _step(), openclaw, emit_event)
        await asyncio.sleep(0.05)

    openclaw.capture_host_browser_screenshot.assert_awaited_once()
    openclaw.capture_screenshot.assert_awaited_once()
    assert "https://signed.example.com/agent.png" in state["_persisted_screenshots"]
    artifact_events = [
        call.args[2]
        for call in emit_event.await_args_list
        if len(call.args) >= 3 and call.args[1] == "artifact_created"
    ]
    assert artifact_events
    assert artifact_events[-1]["source"] == "openclaw_browser"
