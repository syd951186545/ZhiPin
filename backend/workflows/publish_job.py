"""
工作流 1：发布招聘公告

LangGraph StateGraph 实现：
login_check → generate_announcement → fill_and_publish → verify_result
"""

import logging

from workflows.base import (
    WorkflowState,
    StepDefinition,
    build_execution_session_id,
    finalize_persisted_screenshots,
    run_workflow_graph,
)
from workflows.contracts import (
    ERROR_DATA_MISSING,
    ERROR_UNKNOWN,
    RetryPolicy,
    StepVerificationOutcome,
    default_step_verifier,
)
from services.openclaw_client import OpenClawClient
from services.platform_catalog import get_platform_name
from services.platform_session_store import resolve_runtime_browser_profile
from services.supabase_client import (
    complete_automation_task,
    insert_task_log,
)
from parsers.result_parser import parse_announcement, parse_publish_result
from prompts.publish_job import (
    build_login_check_prompt,
    build_generate_announcement_prompt,
    build_fill_and_publish_prompt,
    build_verify_result_prompt,
)
from routers.workflow import emit_event, get_execution_task, is_cancelled

logger = logging.getLogger(__name__)


def _verify_announcement_step(state: WorkflowState, result) -> StepVerificationOutcome:
    marker_outcome = default_step_verifier("generate_announcement", result.accumulated_text, result.error)
    if not marker_outcome.success:
        return marker_outcome

    announcement = parse_announcement(result.accumulated_text or "")
    if not announcement:
        return StepVerificationOutcome(
            success=False,
            error="未提取到招聘公告内容",
            error_code=ERROR_DATA_MISSING,
        )
    return StepVerificationOutcome(success=True, details={"announcement_length": len(announcement)})


def _verify_publish_result_step(state: WorkflowState, result) -> StepVerificationOutcome:
    marker_outcome = default_step_verifier("verify_result", result.accumulated_text, result.error)
    if not marker_outcome.success:
        return marker_outcome

    publish_result = parse_publish_result(result.accumulated_text or "")
    if not publish_result:
        return StepVerificationOutcome(
            success=False,
            error="未提取到发布结果结构化信息",
            error_code=ERROR_DATA_MISSING,
        )

    status_text = str(publish_result.get("status") or "").strip()
    if not status_text:
        return StepVerificationOutcome(
            success=False,
            error="发布结果缺少状态字段",
            error_code=ERROR_DATA_MISSING,
            details={"publish_result": publish_result},
        )

    if "失败" in status_text:
        return StepVerificationOutcome(
            success=False,
            error=f"发布结果校验失败: {status_text}",
            error_code=ERROR_UNKNOWN,
            details={"publish_result": publish_result},
        )

    return StepVerificationOutcome(success=True, details={"publish_result": publish_result})

# ── 步骤定义 ──────────────────────────────────────────────

STEPS = [
    StepDefinition(
        id="login_check",
        name_zh="登录检查",
        prompt_builder=build_login_check_prompt,
        retry_policy=RetryPolicy(max_attempts=2),
    ),
    StepDefinition(
        id="generate_announcement",
        name_zh="生成招聘公告",
        prompt_builder=build_generate_announcement_prompt,
        verifier=_verify_announcement_step,
    ),
    StepDefinition(
        id="fill_and_publish",
        name_zh="填写并发布",
        prompt_builder=build_fill_and_publish_prompt,
        retry_policy=RetryPolicy(max_attempts=2),
    ),
    StepDefinition(
        id="verify_result",
        name_zh="验证发布结果",
        prompt_builder=build_verify_result_prompt,
        verifier=_verify_publish_result_step,
        retry_policy=RetryPolicy(max_attempts=2),
    ),
]

# 步骤元数据（供前端显示）
STEP_META = [
    {"id": s.id, "name_zh": s.name_zh, "requires_openclaw": s.requires_openclaw}
    for s in STEPS
]


# ── 工作流入口 ────────────────────────────────────────────


async def run(execution_id: str, req):
    """运行发布招聘公告工作流"""

    await emit_event(execution_id, "run_started", {
        "execution_id": execution_id,
        "workflow_id": "publish_job",
        "workflow_name": "发布招聘公告",
    })

    # 发送工作流元数据
    await emit_event(execution_id, "workflow_meta", {
        "workflow_id": "publish_job",
        "workflow_name": "发布招聘公告",
        "steps": STEP_META,
        "platform": req.platform,
    })

    auth_token = req.supabase_auth_token or None
    task_meta = get_execution_task(execution_id)
    task_record = {"id": task_meta["task_id"]} if task_meta.get("task_id") else {}
    if task_meta.get("auth_token"):
        auth_token = task_meta["auth_token"]

    # 初始化状态
    persistent_session_key = req.platform_accounts[0].get("browser_session_key", "")
    runtime_session_id = build_execution_session_id(persistent_session_key, execution_id, req.platform)

    initial_state: WorkflowState = {
        "execution_id": execution_id,
        "workflow_id": "publish_job",
        "session_id": runtime_session_id,
        "browser_profile": resolve_runtime_browser_profile(persistent_session_key),
        "current_step": "",
        "step_index": 0,
        "total_steps": len(STEPS),
        "platform": get_platform_name(req.platform),
        "platform_url": req.platform_accounts[0].get("platform_url", ""),
        "account_id": req.account_id,
        "account_name": req.account_name,
        "browser_session_key": persistent_session_key,
        "platform_accounts": req.platform_accounts,
        "job_id": req.job_id or "",
        "job_title": req.job_title,
        "job_location": req.job_location,
        "job_salary_min": req.job_salary_min or 0,
        "job_salary_max": req.job_salary_max or 0,
        "job_employment_type": req.job_employment_type,
        "job_department": req.job_department,
        "job_description": req.job_description,
        "job_requirements": req.job_requirements,
        "job_benefits": req.job_benefits,
        "company_name": req.company_name,
        "company_address": req.company_address,
        "company_size": req.company_size,
        "company_overview": req.company_overview,
        "step_results": {},
        "accumulated_text": "",
        "all_screenshots": [],
        "artifacts": [],
        "checkpoints": [],
        "latest_checkpoint": None,
        "step_attempts": {},
        "current_error_code": None,
        "parsed_candidates": [],
        "announcement_text": "",
        "publish_result": {},
        "result_summary": {},
        "error": None,
        "cancelled": False,
        "completed": False,
        "_auth_token": req.supabase_auth_token or "",  # 用于 Storage 截图上传
        "_task_id": task_record.get("id", ""),
        "_tenant_id": req.tenant_id,
        "_pending_screenshot_uploads": [],
        "_persisted_screenshots": [],
    }

    workflow_openclaw = OpenClawClient()
    try:
        final_state = await run_workflow_graph(
            state=initial_state,
            steps=STEPS,
            openclaw=workflow_openclaw,
            emit_event=emit_event,
            is_cancelled=is_cancelled,
        )

        # 提取结果
        announcement = parse_announcement(final_state.get("accumulated_text", ""))
        publish_result = parse_publish_result(final_state.get("accumulated_text", ""))

        # 发送完成事件
        if final_state.get("error"):
            await emit_event(execution_id, "error", {
                "step_id": final_state.get("current_step", ""),
                "message": final_state["error"],
                "error_code": final_state.get("current_error_code"),
            })
            await emit_event(execution_id, "run_failed", {
                "execution_id": execution_id,
                "workflow_id": "publish_job",
                "message": final_state["error"],
                "error_code": final_state.get("current_error_code"),
                "latest_checkpoint": final_state.get("latest_checkpoint"),
            })
            final_state = await finalize_persisted_screenshots(final_state)
            if task_record.get("id"):
                complete_automation_task(
                    task_record["id"], "failed",
                    error_message=final_state["error"],
                    full_output=final_state.get("accumulated_text", ""),
                    screenshot_urls=final_state.get("_persisted_screenshots", []),
                    auth_token=auth_token,
                )
        else:
            structured_result = {
                "workflow_id": "publish_job",
                "job_title": req.job_title,
                "platform": req.platform,
                "announcement": announcement,
                "publish_result": publish_result,
                "screenshots_count": len(final_state.get("all_screenshots", [])),
            }
            await emit_event(execution_id, "complete", {
                "announcement": announcement,
                "publish_result": publish_result,
                "screenshots": final_state.get("all_screenshots", []),
                "artifacts": final_state.get("artifacts", []),
                "latest_checkpoint": final_state.get("latest_checkpoint"),
            })
            await emit_event(execution_id, "run_completed", {
                "execution_id": execution_id,
                "workflow_id": "publish_job",
                "latest_checkpoint": final_state.get("latest_checkpoint"),
                "artifacts_count": len(final_state.get("artifacts", [])),
            })
            final_state = await finalize_persisted_screenshots(final_state)
            if task_record.get("id"):
                complete_automation_task(
                    task_record["id"],
                    "completed",
                    result_summary={"jobs_posted": 1, **publish_result, **structured_result},
                    full_output=final_state.get("accumulated_text", ""),
                    screenshot_urls=final_state.get("_persisted_screenshots", []),
                    auth_token=auth_token,
                )

        # 写入日志
        if task_record.get("id") and req.tenant_id:
            level = "success" if final_state.get("completed") else "error"
            insert_task_log(
                task_id=task_record["id"],
                tenant_id=req.tenant_id,
                level=level,
                message=f"发布招聘公告{'完成' if final_state.get('completed') else '失败'}",
                metadata={"publish_result": publish_result},
                auth_token=auth_token,
            )
    finally:
        # 账号级 browser profile 需要跨运行复用，这里不主动删除。
        pass
