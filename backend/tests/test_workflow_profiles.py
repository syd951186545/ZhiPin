from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from prompts.publish_job import build_login_check_prompt
from services.platform_session_store import resolve_runtime_browser_profile
from workflows import publish_job
from workflows.contracts import ERROR_TOOL, default_step_verifier, infer_error_code


def test_publish_job_login_prompt_uses_resolved_runtime_profile():
    raw_profile = (
        "tenant-2c9492a4-6bd7-4290-b55c-a65c48fad74a-platform-58-"
        "account-f3814fc6-1136-423d-8673-24eff6d45620-v1-581ffaef9f3f"
    )
    prompt = build_login_check_prompt({
        "browser_profile": raw_profile,
        "browser_session_key": raw_profile,
        "platform": "58同城",
    })

    expected_profile = resolve_runtime_browser_profile(raw_profile)
    assert f'profile="{expected_profile}"' in prompt
    assert f'profile="{raw_profile}"' not in prompt


@pytest.mark.asyncio
async def test_publish_job_run_initializes_normalized_browser_profile():
    raw_profile = (
        "tenant-2c9492a4-6bd7-4290-b55c-a65c48fad74a-platform-58-"
        "account-f3814fc6-1136-423d-8673-24eff6d45620-v1-581ffaef9f3f"
    )
    req = SimpleNamespace(
        supabase_auth_token="token",
        tenant_id="tenant-001",
        platform="58",
        account_id="acc-001",
        account_name="test",
        job_id="job-001",
        job_title="测试岗位",
        job_location="长春",
        job_salary_min=10,
        job_salary_max=20,
        job_employment_type="全职",
        job_department="QA",
        job_description="desc",
        job_requirements="req",
        job_benefits="benefits",
        company_name="公司",
        company_address="地址",
        company_size="50-100人",
        company_overview="overview",
        platform_accounts=[{"browser_session_key": raw_profile, "platform_url": "https://vip.58.com"}],
    )

    with (
        patch("workflows.publish_job.emit_event", new=AsyncMock()),
        patch("workflows.publish_job.get_execution_task", return_value={}),
        patch(
            "workflows.publish_job.run_workflow_graph",
            new=AsyncMock(return_value={"completed": True, "accumulated_text": "", "all_screenshots": [], "artifacts": []}),
        ) as mock_run,
        patch("workflows.publish_job.finalize_persisted_screenshots", new=AsyncMock(side_effect=lambda state: state)),
    ):
        await publish_job.run("exec-001", req)

    initial_state = mock_run.await_args.kwargs["state"]
    assert initial_state["browser_profile"] == resolve_runtime_browser_profile(raw_profile)


def test_login_check_profile_not_found_is_tool_error():
    text = (
        "[STEP_FAILED:login_check]\n"
        "BrowserProfileNotFoundError: Profile \"raw-profile\" not found.\n"
        "- 目标 profile `raw-profile` 在浏览器中不存在（可用列表中仅有：sess-001、openclaw）"
    )

    outcome = default_step_verifier("login_check", text)
    assert outcome.success is False
    assert outcome.error_code == ERROR_TOOL
    assert infer_error_code("步骤执行失败", text, "login_check") == ERROR_TOOL
