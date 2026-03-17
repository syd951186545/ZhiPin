"""
工作流 2：市场人才探索

LangGraph StateGraph 实现：
login_check → search_candidates → collect_profiles → initiate_contact → save_results
"""

import logging
from uuid import uuid4

from workflows.base import WorkflowState, StepDefinition, execute_step, run_steps
from services.openclaw_client import OpenClawClient
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
from routers.workflow import emit_event, is_cancelled

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
            )
        except Exception as e:
            logger.warning(f"创建任务记录失败: {e}")

    initial_state: WorkflowState = {
        "execution_id": execution_id,
        "workflow_id": "talent_explore",
        "session_id": str(uuid4()),
        "current_step": "",
        "step_index": 0,
        "total_steps": len(STEPS),
        "platform": _get_platform_name(req.platform),
        "account_name": req.account_name,
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
        "error": None,
        "completed": False,
    }

    # 执行 OpenClaw 步骤（前4步）
    openclaw_steps = [s for s in STEPS if s.requires_openclaw]
    final_state = await run_steps(
        state=initial_state,
        steps=openclaw_steps,
        openclaw=OpenClawClient(
            base_url=req.openclaw_base_url or None,
            auth_token=req.openclaw_auth_token or None,
        ),
        emit_event=emit_event,
        is_cancelled=is_cancelled,
    )

    # 第5步：保存结果到 Supabase
    await emit_event(execution_id, "step_change", {
        "step_id": "save_results",
        "step_name": "保存结果",
        "status": "running",
        "step_index": len(openclaw_steps),
        "total_steps": len(STEPS),
    })

    # 提取候选人数据
    source_key = _get_source_key(req.platform)
    candidates = parse_candidate_list(
        final_state.get("accumulated_text", ""),
        source=source_key,
        job_id=req.job_id,
    )

    saved_count = 0
    if candidates and req.tenant_id:
        try:
            saved = create_candidates_batch(req.tenant_id, candidates)
            saved_count = len(saved)
            logger.info(f"[{execution_id}] 保存 {saved_count} 个候选人")
        except Exception as e:
            logger.error(f"[{execution_id}] 保存候选人失败: {e}")

    await emit_event(execution_id, "step_change", {
        "step_id": "save_results",
        "step_name": "保存结果",
        "status": "done",
    })

    # 发送完成事件
    result_summary = {
        "candidates_found": len(candidates),
        "candidates_saved": saved_count,
    }

    if final_state.get("error"):
        await emit_event(execution_id, "error", {
            "step_id": final_state.get("current_step", ""),
            "message": final_state["error"],
        })
        if task_record.get("id"):
            complete_automation_task(task_record["id"], "failed", error_message=final_state["error"])
    else:
        await emit_event(execution_id, "complete", {
            "result_summary": result_summary,
            "screenshots": final_state.get("all_screenshots", []),
        })
        if task_record.get("id"):
            complete_automation_task(task_record["id"], "completed", result_summary=result_summary)

    if task_record.get("id") and req.tenant_id:
        insert_task_log(
            task_id=task_record["id"],
            tenant_id=req.tenant_id,
            level="success" if not final_state.get("error") else "error",
            message=f"市场人才探索{'完成' if not final_state.get('error') else '失败'}，发现 {len(candidates)} 个候选人",
            metadata=result_summary,
        )


def _get_platform_name(key: str) -> str:
    names = {"boss_zhipin": "BOSS直聘", "58": "58同城", "linkedin": "领英"}
    return names.get(key, key)


def _get_source_key(platform: str) -> str:
    source_map = {"boss_zhipin": "boss_zhipin", "58": "58", "linkedin": "linkedin"}
    return source_map.get(platform, "openclaw_auto")
