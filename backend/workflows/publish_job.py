"""
工作流 1：发布招聘公告

LangGraph StateGraph 实现：
login_check → generate_announcement → fill_and_publish → verify_result
"""

import logging
from uuid import uuid4

from langgraph.graph import StateGraph, END

from workflows.base import WorkflowState, StepDefinition, execute_step, run_steps
from services.openclaw_client import OpenClawClient
from services.supabase_client import (
    create_automation_task,
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
from routers.workflow import emit_event, is_cancelled

logger = logging.getLogger(__name__)

# ── 步骤定义 ──────────────────────────────────────────────

STEPS = [
    StepDefinition(
        id="login_check",
        name_zh="登录检查",
        prompt_builder=build_login_check_prompt,
    ),
    StepDefinition(
        id="generate_announcement",
        name_zh="生成招聘公告",
        prompt_builder=build_generate_announcement_prompt,
    ),
    StepDefinition(
        id="fill_and_publish",
        name_zh="填写并发布",
        prompt_builder=build_fill_and_publish_prompt,
    ),
    StepDefinition(
        id="verify_result",
        name_zh="验证发布结果",
        prompt_builder=build_verify_result_prompt,
    ),
]

# 步骤元数据（供前端显示）
STEP_META = [
    {"id": s.id, "name_zh": s.name_zh, "requires_openclaw": s.requires_openclaw}
    for s in STEPS
]


# ── LangGraph 节点函数 ────────────────────────────────────


def build_graph():
    """构建 LangGraph StateGraph"""
    graph = StateGraph(WorkflowState)

    # 添加节点 - 每个节点对应一个步骤
    for step in STEPS:
        # 创建闭包捕获 step
        def make_node(s):
            async def node(state: WorkflowState) -> WorkflowState:
                openclaw = OpenClawClient(
                    base_url=state.get("_openclaw_url", ""),
                    auth_token=state.get("_openclaw_token", ""),
                )
                return await execute_step(state, s, openclaw, emit_event)
            return node

        graph.add_node(step.id, make_node(step))

    # 添加边 - 线性流转，失败时跳到 END
    graph.set_entry_point("login_check")

    for i in range(len(STEPS) - 1):
        current = STEPS[i]
        next_step = STEPS[i + 1]

        def make_router(curr_id, next_id):
            def router(state: WorkflowState):
                if state.get("error"):
                    return END
                return next_id
            return router

        graph.add_conditional_edges(
            current.id,
            make_router(current.id, next_step.id),
            {next_step.id: next_step.id, END: END},
        )

    graph.add_edge(STEPS[-1].id, END)

    return graph.compile()


# ── 工作流入口 ────────────────────────────────────────────


async def run(execution_id: str, req):
    """运行发布招聘公告工作流"""

    # 发送工作流元数据
    await emit_event(execution_id, "workflow_meta", {
        "workflow_id": "publish_job",
        "workflow_name": "发布招聘公告",
        "steps": STEP_META,
        "platform": req.platform,
    })

    # 创建数据库任务记录
    auth_token = req.supabase_auth_token or None
    task_record = {}
    if req.tenant_id:
        try:
            task_record = create_automation_task(
                tenant_id=req.tenant_id,
                created_by=req.user_id,
                task_type="publish_job",
                name=f"发布招聘公告 - {req.job_title}",
                config=req.model_dump(),
                platform=req.platform,
                job_id=req.job_id,
                auth_token=auth_token,
            )
        except Exception as e:
            logger.warning(f"创建任务记录失败: {e}")

    # 初始化状态
    initial_state: WorkflowState = {
        "execution_id": execution_id,
        "workflow_id": "publish_job",
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
        "step_results": {},
        "accumulated_text": "",
        "all_screenshots": [],
        "parsed_candidates": [],
        "announcement_text": "",
        "publish_result": {},
        "error": None,
        "completed": False,
        "_openclaw_url": req.openclaw_base_url or "",
        "_openclaw_token": req.openclaw_auth_token or "",
        "_auth_token": req.supabase_auth_token or "",  # 用于 Storage 截图上传
    }

    # 使用简单的步骤执行器（比 LangGraph compile 更直接，且支持取消检测）
    final_state = await run_steps(
        state=initial_state,
        steps=STEPS,
        openclaw=OpenClawClient(
            base_url=req.openclaw_base_url or None,
            auth_token=req.openclaw_auth_token or None,
        ),
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
        })
        if task_record.get("id"):
            complete_automation_task(task_record["id"], "failed", error_message=final_state["error"], auth_token=auth_token)
    else:
        await emit_event(execution_id, "complete", {
            "announcement": announcement,
            "publish_result": publish_result,
            "screenshots": final_state.get("all_screenshots", []),
        })
        if task_record.get("id"):
            complete_automation_task(
                task_record["id"],
                "completed",
                result_summary={"jobs_posted": 1, **publish_result},
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


def _get_platform_name(key: str) -> str:
    names = {"boss_zhipin": "BOSS直聘", "58": "58同城", "linkedin": "领英"}
    return names.get(key, key)
