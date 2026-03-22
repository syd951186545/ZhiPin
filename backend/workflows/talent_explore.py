"""
工作流 2：市场人才探索

LangGraph StateGraph 实现：
login_check → search_candidates → collect_profiles → initiate_contact → save_results
"""

import logging

from workflows.base import WorkflowState, StepDefinition, finalize_persisted_screenshots, run_workflow_graph
from services.openclaw_client import OpenClawClient
from services.platform_catalog import get_platform_name
from services.supabase_client import (
    create_automation_task,
    complete_automation_task,
    create_candidates_batch,
    insert_task_log,
)
from parsers.result_parser import parse_candidate_list
from prompts.talent_explore import (
    build_login_check_prompt,
    build_search_candidates_prompt,
    build_collect_profiles_prompt,
    build_initiate_contact_prompt,
)
from routers.workflow import emit_event, is_cancelled, register_execution_task

logger = logging.getLogger(__name__)

# ── 步骤定义 ──────────────────────────────────────────────

STEPS = [
    StepDefinition(
        id="login_check",
        name_zh="登录平台",
        prompt_builder=build_login_check_prompt,
    ),
    StepDefinition(
        id="search_candidates",
        name_zh="搜索候选人",
        prompt_builder=build_search_candidates_prompt,
    ),
    StepDefinition(
        id="collect_profiles",
        name_zh="采集候选人资料",
        prompt_builder=build_collect_profiles_prompt,
    ),
    StepDefinition(
        id="initiate_contact",
        name_zh="主动沟通",
        prompt_builder=build_initiate_contact_prompt,
    ),
    StepDefinition(
        id="save_results",
        name_zh="保存结果",
        prompt_builder=lambda state: "",  # 纯后端步骤
        requires_openclaw=False,
    ),
]

STEP_META = [
    {"id": s.id, "name_zh": s.name_zh, "requires_openclaw": s.requires_openclaw}
    for s in STEPS
]


# ── 工作流入口 ────────────────────────────────────────────


async def run(execution_id: str, req):
    """运行市场人才探索工作流"""

    await emit_event(execution_id, "workflow_meta", {
        "workflow_id": "talent_explore",
        "workflow_name": "市场人才探索",
        "steps": STEP_META,
        "platform": req.platform,
    })

    auth_token = req.supabase_auth_token or None
    # 创建数据库任务记录
    task_record = {}
    if req.tenant_id:
        try:
            task_record = create_automation_task(
                tenant_id=req.tenant_id,
                created_by=req.user_id,
                task_type="talent_explore",
                name=f"市场人才探索 - {req.job_title}",
                config=req.model_dump(),
                platform=req.platform,
                job_id=req.job_id,
                execution_id=execution_id,
                auth_token=auth_token,
            )
            if task_record.get("id"):
                register_execution_task(execution_id, task_record["id"], auth_token)
        except Exception as e:
            logger.warning(f"创建任务记录失败: {e}")

    initial_state: WorkflowState = {
        "execution_id": execution_id,
        "workflow_id": "talent_explore",
        "session_id": req.platform_accounts[0].get("browser_session_key", ""),
        "current_step": "",
        "step_index": 0,
        "total_steps": len(STEPS),
        "platform": get_platform_name(req.platform),
        "account_id": req.account_id,
        "account_name": req.account_name,
        "browser_session_key": req.platform_accounts[0].get("browser_session_key", ""),
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
        "min_match_score": req.min_match_score,
        "max_results": req.max_results,
        "step_results": {},
        "accumulated_text": "",
        "all_screenshots": [],
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

    async def save_results_step(state: WorkflowState) -> WorkflowState:
        step_id = state["current_step"]
        step_name = next(step.name_zh for step in STEPS if step.id == step_id)

        await emit_event(execution_id, "step_change", {
            "step_id": step_id,
            "step_name": step_name,
            "status": "running",
            "step_index": state["step_index"],
            "total_steps": state["total_steps"],
        })

        source_key = _get_source_key(req.platform)
        candidates = parse_candidate_list(
            state.get("accumulated_text", ""),
            source=source_key,
            job_id=req.job_id,
        )

        saved_count = 0
        if candidates and req.tenant_id:
            try:
                saved = create_candidates_batch(req.tenant_id, candidates, auth_token=auth_token)
                saved_count = len(saved)
                logger.info(f"[{execution_id}] 保存 {saved_count} 个候选人")
            except Exception as e:
                logger.error(f"[{execution_id}] 保存候选人失败: {e}")

        new_state = dict(state)
        new_state["parsed_candidates"] = candidates
        new_state["result_summary"] = {
            "candidates_found": len(candidates),
            "candidates_saved": saved_count,
        }

        await emit_event(execution_id, "step_change", {
            "step_id": step_id,
            "step_name": step_name,
            "status": "done",
        })
        return new_state

    runtime_steps = [
        *STEPS[:-1],
        StepDefinition(
            id="save_results",
            name_zh="保存结果",
            requires_openclaw=False,
            executor=save_results_step,
        ),
    ]

    final_state = await run_workflow_graph(
        state=initial_state,
        steps=runtime_steps,
        openclaw=OpenClawClient(),
        emit_event=emit_event,
        is_cancelled=is_cancelled,
    )

    candidates = final_state.get("parsed_candidates", [])
    result_summary = final_state.get("result_summary", {
        "candidates_found": len(candidates),
        "candidates_saved": 0,
    })

    full_output = final_state.get("accumulated_text", "")
    all_screenshots = final_state.get("all_screenshots", [])

    if final_state.get("error"):
        await emit_event(execution_id, "error", {
            "step_id": final_state.get("current_step", ""),
            "message": final_state["error"],
        })
        final_state = await finalize_persisted_screenshots(final_state)
        if task_record.get("id"):
            complete_automation_task(
                task_record["id"], "failed",
                error_message=final_state["error"],
                full_output=full_output,
                screenshot_urls=final_state.get("_persisted_screenshots", []),
                auth_token=auth_token,
            )
    else:
        structured_result = {
            "workflow_id": "talent_explore",
            "job_title": req.job_title,
            "platform": req.platform,
            "candidates_found": result_summary.get("candidates_found", len(candidates)),
            "candidates_saved": result_summary.get("candidates_saved", 0),
            "candidate_preview": candidates[:10],
            "screenshots_count": len(all_screenshots),
        }
        await emit_event(execution_id, "complete", {
            "result_summary": result_summary,
            "screenshots": all_screenshots,
        })
        final_state = await finalize_persisted_screenshots(final_state)
        if task_record.get("id"):
            complete_automation_task(
                task_record["id"], "completed",
                result_summary={**result_summary, **structured_result},
                full_output=full_output,
                screenshot_urls=final_state.get("_persisted_screenshots", []),
                auth_token=auth_token,
            )

    if task_record.get("id") and req.tenant_id:
        insert_task_log(
            task_id=task_record["id"],
            tenant_id=req.tenant_id,
            level="success" if not final_state.get("error") else "error",
            message=f"市场人才探索{'完成' if not final_state.get('error') else '失败'}，发现 {len(candidates)} 个候选人",
            metadata=result_summary,
            auth_token=auth_token,
        )


def _get_source_key(platform: str) -> str:
    source_map = {
        "boss_zhipin": "boss_zhipin",
        "58": "58",
        "liepin": "liepin",
        "zhilian": "zhilian",
        "51job": "51job",
        "lagou": "lagou",
    }
    return source_map.get(platform, "openclaw_auto")
