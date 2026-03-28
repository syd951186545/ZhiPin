"""
工作流 3：简历筛选及 AI 沟通

多平台串行执行：
对每个用户选中的平台依次执行 login → collect → analyze → contact，
最后汇总写入 Supabase。
"""

import logging

from workflows.base import (
    WorkflowState,
    StepDefinition,
    build_execution_session_id,
    execute_step,
    finalize_persisted_screenshots,
    run_workflow_graph,
)
from workflows.contracts import RetryPolicy
from services.openclaw_client import OpenClawClient
from services.platform_catalog import get_platform_name
from services.supabase_client import (
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
from routers.workflow import emit_event, get_execution_task, is_cancelled

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

    await emit_event(execution_id, "run_started", {
        "execution_id": execution_id,
        "workflow_id": "resume_screen",
        "workflow_name": "简历筛选及AI沟通",
    })

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

    auth_token = req.supabase_auth_token or None
    task_meta = get_execution_task(execution_id)
    task_record = {"id": task_meta["task_id"]} if task_meta.get("task_id") else {}
    if task_meta.get("auth_token"):
        auth_token = task_meta["auth_token"]

    total_steps = len(all_step_meta)

    initial_state: WorkflowState = {
        "execution_id": execution_id,
        "workflow_id": "resume_screen",
        "session_id": "",
        "browser_profile": "",
        "current_step": "",
        "step_index": 0,
        "total_steps": total_steps,
        "platform": "",
        "platform_url": "",
        "platforms": platforms,
        "current_platform_index": 0,
        "account_id": "",
        "account_name": req.account_name,
        "browser_session_key": "",
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
        "_auth_token": req.supabase_auth_token or "",
        "_task_id": task_record.get("id", ""),
        "_tenant_id": req.tenant_id,
        "_pending_screenshot_uploads": [],
        "_persisted_screenshots": [],
    }

    workflow_openclaw = OpenClawClient()
    runtime_steps: list[StepDefinition] = []

    for platform_index, platform in enumerate(platforms):
        pname = get_platform_name(platform)
        platform_finish_node_id = f"platform_finish_{platform}"

        def make_platform_start_executor(current_platform=platform, current_pname=pname, current_index=platform_index):
            async def executor(state: WorkflowState) -> WorkflowState:
                await emit_event(execution_id, "platform_change", {
                    "platform": current_platform,
                    "platform_name": current_pname,
                    "platform_index": current_index,
                    "total_platforms": len(platforms),
                })

                new_state = dict(state)
                new_state["platform"] = current_pname
                new_state["current_platform_index"] = current_index
                platform_account = next(
                    (item for item in req.platform_accounts if item.get("platform") == current_platform),
                    {},
                )
                persistent_session_key = platform_account.get("browser_session_key", "")
                runtime_session_id = build_execution_session_id(
                    persistent_session_key,
                    execution_id,
                    current_platform,
                )
                new_state["session_id"] = runtime_session_id
                new_state["browser_profile"] = persistent_session_key
                new_state["browser_session_key"] = persistent_session_key
                new_state["platform_url"] = platform_account.get("platform_url", "")
                new_state["account_id"] = platform_account.get("id", "")
                new_state["account_name"] = platform_account.get("account_name") or platform_account.get("name") or ""
                new_state["accumulated_text"] = ""
                return new_state

            return executor

        runtime_steps.append(
            StepDefinition(
                id=f"platform_start_{platform}",
                name_zh=f"[{pname}] 平台开始",
                requires_openclaw=False,
                executor=make_platform_start_executor(),
                visible=False,
            )
        )

        for base_step in PER_PLATFORM_STEPS:
            step_id = f"{base_step.id}_{platform}"
            step_name = f"[{pname}] {base_step.name_zh}"

            def make_platform_step_executor(
                current_step_id=step_id,
                current_step_name=step_name,
                prompt_builder=base_step.prompt_builder,
                jump_target=platform_finish_node_id,
                current_platform=platform,
                current_pname=pname,
            ):
                async def executor(state: WorkflowState) -> WorkflowState:
                    step = StepDefinition(
                        id=current_step_id,
                        name_zh=current_step_name,
                        prompt_builder=prompt_builder,
                        requires_openclaw=True,
                        retry_policy=RetryPolicy(max_attempts=2) if current_step_id.startswith("login_check_") else RetryPolicy(max_attempts=1),
                    )

                    result_state = await execute_step(state, step, workflow_openclaw, emit_event)
                    if result_state.get("error"):
                        logger.error(
                            f"[{execution_id}] 平台 {current_pname} 步骤 {current_step_id} 失败: {result_state['error']}"
                        )
                        await emit_event(execution_id, "platform_error", {
                            "platform": current_platform,
                            "platform_name": current_pname,
                            "error": result_state["error"],
                        })
                        result_state["error"] = None
                        result_state["_jump_to"] = jump_target
                    return result_state

                return executor

            runtime_steps.append(
                StepDefinition(
                    id=step_id,
                    name_zh=step_name,
                    requires_openclaw=False,
                    executor=make_platform_step_executor(),
                )
            )

        def make_platform_finish_executor(current_platform=platform, current_pname=pname):
            async def executor(state: WorkflowState) -> WorkflowState:
                source_key = _get_source_key(current_platform)
                platform_candidates = parse_resume_analysis(
                    state.get("accumulated_text", ""),
                    source=source_key,
                    job_id=req.job_id,
                    min_match_score=req.min_match_score,
                )

                new_state = dict(state)
                new_state["parsed_candidates"] = state.get("parsed_candidates", []) + platform_candidates

                logger.info(
                    f"[{execution_id}] 平台 {current_pname} 完成，发现 {len(platform_candidates)} 个候选人"
                )
                return new_state

            return executor

        runtime_steps.append(
            StepDefinition(
                id=platform_finish_node_id,
                name_zh=f"[{pname}] 平台收尾",
                requires_openclaw=False,
                executor=make_platform_finish_executor(),
                visible=False,
            )
        )

    async def save_results_step(state: WorkflowState) -> WorkflowState:
        step_id = state["current_step"]
        step_name = "汇总保存结果"

        await emit_event(execution_id, "step_change", {
            "step_id": step_id,
            "step_name": step_name,
            "status": "running",
            "step_index": state["step_index"],
            "total_steps": state["total_steps"],
        })

        all_candidates = state.get("parsed_candidates", [])
        saved_count = 0
        if all_candidates and req.tenant_id:
            try:
                saved = create_candidates_batch(req.tenant_id, all_candidates, auth_token=auth_token)
                saved_count = len(saved)
                logger.info(f"[{execution_id}] 汇总保存 {saved_count} 个候选人")
            except Exception as e:
                logger.error(f"[{execution_id}] 保存候选人失败: {e}")

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

        new_state = dict(state)
        new_state["result_summary"] = result_summary

        await emit_event(execution_id, "step_change", {
            "step_id": step_id,
            "step_name": step_name,
            "status": "done",
        })
        return new_state

    runtime_steps.append(
        StepDefinition(
            id="save_results",
            name_zh="汇总保存结果",
            requires_openclaw=False,
            executor=save_results_step,
        )
    )

    final_state = await run_workflow_graph(
        state=initial_state,
        steps=runtime_steps,
        openclaw=workflow_openclaw,
        emit_event=emit_event,
        is_cancelled=is_cancelled,
    )

    full_output = final_state.get("accumulated_text", "")

    if final_state.get("cancelled"):
        final_state = await finalize_persisted_screenshots(final_state)
        await emit_event(execution_id, "run_failed", {
            "execution_id": execution_id,
            "workflow_id": "resume_screen",
            "message": "用户取消",
            "error_code": "USER_CANCELLED",
            "latest_checkpoint": final_state.get("latest_checkpoint"),
        })
        if task_record.get("id"):
            complete_automation_task(
                task_record["id"], "cancelled",
                error_message="用户取消",
                full_output=full_output,
                screenshot_urls=final_state.get("_persisted_screenshots", []),
                auth_token=auth_token,
            )
        return

    all_candidates = final_state.get("parsed_candidates", [])
    all_screenshots = final_state.get("all_screenshots", [])
    result_summary = final_state.get("result_summary", {})

    await emit_event(execution_id, "complete", {
        "result_summary": result_summary,
        "screenshots": all_screenshots,
        "artifacts": final_state.get("artifacts", []),
        "latest_checkpoint": final_state.get("latest_checkpoint"),
    })
    await emit_event(execution_id, "run_completed", {
        "execution_id": execution_id,
        "workflow_id": "resume_screen",
        "latest_checkpoint": final_state.get("latest_checkpoint"),
        "artifacts_count": len(final_state.get("artifacts", [])),
    })

    final_state = await finalize_persisted_screenshots(final_state)
    if task_record.get("id"):
        structured_result = {
            "workflow_id": "resume_screen",
            "job_title": req.job_title,
            "platforms": platforms,
            "resumes_screened": result_summary.get("resumes_screened", len(all_candidates)),
            "candidates_found": result_summary.get("candidates_found", len(all_candidates)),
            "candidates_saved": result_summary.get("candidates_saved", 0),
            "match_rate": result_summary.get("match_rate"),
            "candidate_preview": all_candidates[:10],
            "screenshots_count": len(all_screenshots),
        }
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
            level="success",
            message=f"简历筛选完成，共处理 {len(platforms)} 个平台，发现 {len(all_candidates)} 个候选人",
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
