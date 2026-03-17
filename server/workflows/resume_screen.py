"""
工作流 3：简历筛选及 AI 沟通

多平台串行执行：
对每个用户选中的平台依次执行 login → collect → analyze → contact，
最后汇总写入 Supabase。
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
from parsers.result_parser import parse_resume_analysis
from prompts.resume_screen import (
    build_login_check_prompt,
    build_collect_resumes_prompt,
    build_analyze_match_prompt,
    build_contact_qualified_prompt,
)
from routers.workflow import emit_event, is_cancelled

logger = logging.getLogger(__name__)

# ── 每平台的步骤定义 ──────────────────────────────────────

PER_PLATFORM_STEPS = [
    StepDefinition(
        id="login_check",
        name_zh="登录平台",
        prompt_builder=build_login_check_prompt,
    ),
    StepDefinition(
        id="collect_resumes",
        name_zh="采集简历",
        prompt_builder=build_collect_resumes_prompt,
    ),
    StepDefinition(
        id="analyze_match",
        name_zh="分析匹配度",
        prompt_builder=build_analyze_match_prompt,
    ),
    StepDefinition(
        id="contact_qualified",
        name_zh="沟通邀约",
        prompt_builder=build_contact_qualified_prompt,
    ),
]


# ── 工作流入口 ────────────────────────────────────────────


async def run(execution_id: str, req):
    """运行简历筛选及AI沟通工作流（多平台串行）"""

    platforms = req.platforms or ([req.platform] if req.platform else [])
    if not platforms:
        await emit_event(execution_id, "error", {
            "step_id": "init",
            "message": "未选择任何平台",
        })
        return

    # 构建完整步骤列表（用于前端显示）
    all_step_meta = []
    for platform in platforms:
        pname = _get_platform_name(platform)
        for step in PER_PLATFORM_STEPS:
            all_step_meta.append({
                "id": f"{step.id}_{platform}",
                "name_zh": f"[{pname}] {step.name_zh}",
                "requires_openclaw": step.requires_openclaw,
                "platform": platform,
            })
    all_step_meta.append({
        "id": "save_results",
        "name_zh": "汇总保存结果",
        "requires_openclaw": False,
    })

    await emit_event(execution_id, "workflow_meta", {
        "workflow_id": "resume_screen",
        "workflow_name": "简历筛选及AI沟通",
        "steps": all_step_meta,
        "platforms": platforms,
        "multi_platform": True,
    })

    # 创建数据库任务记录
    task_record = {}
    if req.tenant_id:
        try:
            task_record = create_automation_task(
                tenant_id=req.tenant_id,
                created_by=req.user_id,
                task_type="resume_screen",
                name=f"简历筛选 - {req.job_title}",
                config=req.model_dump(),
                platform=",".join(platforms),
                job_id=req.job_id,
            )
        except Exception as e:
            logger.warning(f"创建任务记录失败: {e}")

    # 汇总所有平台的候选人
    all_candidates: list[dict] = []
    all_screenshots: list[str] = []
    global_error = None
    global_step_index = 0
    total_steps = len(all_step_meta)

    openclaw = OpenClawClient(
        base_url=req.openclaw_base_url or None,
        auth_token=req.openclaw_auth_token or None,
    )

    # 逐平台执行
    for platform_index, platform in enumerate(platforms):
        pname = _get_platform_name(platform)

        if is_cancelled(execution_id):
            global_error = "用户取消"
            break

        await emit_event(execution_id, "platform_change", {
            "platform": platform,
            "platform_name": pname,
            "platform_index": platform_index,
            "total_platforms": len(platforms),
        })

        # 初始化此平台的状态
        platform_state: WorkflowState = {
            "execution_id": execution_id,
            "workflow_id": "resume_screen",
            "session_id": str(uuid4()),
            "current_step": "",
            "step_index": global_step_index,
            "total_steps": total_steps,
            "platform": pname,
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

        # 为此平台创建带平台前缀的步骤
        platform_steps = []
        for step in PER_PLATFORM_STEPS:
            platform_steps.append(StepDefinition(
                id=f"{step.id}_{platform}",
                name_zh=f"[{pname}] {step.name_zh}",
                prompt_builder=step.prompt_builder,
                requires_openclaw=step.requires_openclaw,
            ))

        # 逐步执行（手动，因为需要跟踪全局 step_index）
        for step in platform_steps:
            if is_cancelled(execution_id):
                global_error = "用户取消"
                break

            platform_state["step_index"] = global_step_index
            platform_state["total_steps"] = total_steps
            platform_state["current_step"] = step.id

            platform_state = await execute_step(
                platform_state, step, openclaw, emit_event,
            )

            global_step_index += 1

            if platform_state.get("error"):
                logger.error(f"[{execution_id}] 平台 {pname} 步骤 {step.id} 失败: {platform_state['error']}")
                # 平台级失败不中断整个工作流，继续下一个平台
                await emit_event(execution_id, "platform_error", {
                    "platform": platform,
                    "platform_name": pname,
                    "error": platform_state["error"],
                })
                break

        # 提取此平台的候选人
        source_key = _get_source_key(platform)
        platform_candidates = parse_resume_analysis(
            platform_state.get("accumulated_text", ""),
            source=source_key,
            job_id=req.job_id,
            min_match_score=req.min_match_score,
        )
        all_candidates.extend(platform_candidates)
        all_screenshots.extend(platform_state.get("all_screenshots", []))

        logger.info(f"[{execution_id}] 平台 {pname} 完成，发现 {len(platform_candidates)} 个候选人")

    if global_error:
        await emit_event(execution_id, "cancelled", {"message": global_error})
        if task_record.get("id"):
            complete_automation_task(task_record["id"], "cancelled", error_message=global_error)
        return

    # 最后步骤：汇总保存结果
    await emit_event(execution_id, "step_change", {
        "step_id": "save_results",
        "step_name": "汇总保存结果",
        "status": "running",
        "step_index": global_step_index,
        "total_steps": total_steps,
    })

    saved_count = 0
    if all_candidates and req.tenant_id:
        try:
            saved = create_candidates_batch(req.tenant_id, all_candidates)
            saved_count = len(saved)
            logger.info(f"[{execution_id}] 汇总保存 {saved_count} 个候选人")
        except Exception as e:
            logger.error(f"[{execution_id}] 保存候选人失败: {e}")

    await emit_event(execution_id, "step_change", {
        "step_id": "save_results",
        "step_name": "汇总保存结果",
        "status": "done",
    })

    # 完成
    result_summary = {
        "resumes_screened": len(all_candidates),
        "candidates_found": len(all_candidates),
        "candidates_saved": saved_count,
        "platforms_processed": len(platforms),
        "match_rate": (
            round(sum(1 for c in all_candidates if (c.get("ai_match_score") or 0) >= req.min_match_score) / len(all_candidates) * 100)
            if all_candidates else 0
        ),
    }

    await emit_event(execution_id, "complete", {
        "result_summary": result_summary,
        "screenshots": all_screenshots,
    })

    if task_record.get("id"):
        complete_automation_task(task_record["id"], "completed", result_summary=result_summary)

    if task_record.get("id") and req.tenant_id:
        insert_task_log(
            task_id=task_record["id"],
            tenant_id=req.tenant_id,
            level="success",
            message=f"简历筛选完成，共处理 {len(platforms)} 个平台，发现 {len(all_candidates)} 个候选人",
            metadata=result_summary,
        )


def _get_platform_name(key: str) -> str:
    names = {"boss_zhipin": "BOSS直聘", "58": "58同城", "linkedin": "领英"}
    return names.get(key, key)


def _get_source_key(platform: str) -> str:
    source_map = {"boss_zhipin": "boss_zhipin", "58": "58", "linkedin": "linkedin"}
    return source_map.get(platform, "openclaw_auto")
