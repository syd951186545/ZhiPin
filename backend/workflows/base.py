"""
工作流基础设施

定义通用的工作流状态、步骤执行逻辑与 LangGraph 运行时，供三个工作流复用。
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional, TypedDict

from langgraph.graph import END, StateGraph

from services.openclaw_client import OpenClawClient, StepResult
from services.supabase_client import make_screenshot_uploader, insert_task_log, update_automation_task

logger = logging.getLogger(__name__)


# ── 工作流状态 (LangGraph State) ──────────────────────────


class WorkflowState(TypedDict, total=False):
    """LangGraph 工作流状态"""
    # 执行标识
    execution_id: str
    workflow_id: str
    session_id: str

    # 当前执行位置
    current_step: str
    step_index: int
    total_steps: int

    # 平台与账号
    platform: str
    platforms: list[str]  # 多平台工作流
    current_platform_index: int
    account_id: str
    account_name: str
    browser_session_key: str
    platform_accounts: list[dict]

    # 岗位信息
    job_id: str
    job_title: str
    job_location: str
    job_salary_min: int
    job_salary_max: int
    job_employment_type: str
    job_department: str
    job_description: str
    job_requirements: str
    job_benefits: str

    # 企业信息
    company_name: str
    company_address: str
    company_size: str
    company_overview: str

    # 执行参数
    min_match_score: int
    max_results: int

    # 执行结果
    step_results: dict[str, dict]  # step_id -> {text, screenshots, success}
    accumulated_text: str
    all_screenshots: list[str]
    parsed_candidates: list[dict]
    announcement_text: str
    publish_result: dict
    result_summary: dict

    # 状态控制
    error: Optional[str]
    cancelled: bool
    completed: bool

    # 内部私有字段（各工作流 run() 函数注入，不传递给前端）
    _auth_token: str       # Supabase 用户 JWT，用于 Storage 截图上传
    _task_id: str          # automation_tasks.id
    _tenant_id: str        # 租户 ID（用于 task_logs）
    _openclaw_url: str     # OpenClaw base URL 覆盖
    _openclaw_token: str   # OpenClaw auth token 覆盖
    _jump_to: str          # LangGraph 条件跳转目标（内部路由使用）
    _pending_screenshot_uploads: list[asyncio.Task]
    _persisted_screenshots: list[str]


# ── 步骤定义 ──────────────────────────────────────────────


StepExecutor = Callable[[WorkflowState], Awaitable[WorkflowState]]


@dataclass
class StepDefinition:
    """工作流步骤定义"""
    id: str
    name_zh: str
    prompt_builder: Optional[Any] = None  # Callable[[WorkflowState], str]
    requires_openclaw: bool = True
    executor: Optional[StepExecutor] = None
    visible: bool = True
    graph_id: Optional[str] = None

    def node_id(self) -> str:
        return self.graph_id or self.id


# ── 步骤执行器 ────────────────────────────────────────────


async def execute_step(
    state: WorkflowState,
    step: StepDefinition,
    openclaw: OpenClawClient,
    emit_event,
) -> WorkflowState:
    """
    执行单个工作流步骤。

    1. 发送 step_change 事件
    2. 构建 prompt
    3. 调用 OpenClaw
    4. 处理结果
    5. 更新状态
    """
    step_id = step.id
    execution_id = state["execution_id"]
    task_id = state.get("_task_id") or ""
    tenant_id = state.get("_tenant_id") or ""
    auth_token = state.get("_auth_token") or None

    # 通知前端步骤开始
    await emit_event(execution_id, "step_change", {
        "step_id": step_id,
        "step_name": step.name_zh,
        "status": "running",
        "step_index": state.get("step_index", 0),
        "total_steps": state.get("total_steps", 1),
        "platform": state.get("platform", ""),
    })

    logger.info(f"[{execution_id}] 执行步骤: {step_id} ({step.name_zh})")
    if task_id and tenant_id:
        try:
            insert_task_log(
                task_id=task_id,
                tenant_id=tenant_id,
                level="info",
                message=f"开始步骤：{step.name_zh}",
                metadata={
                    "step_id": step_id,
                    "step_name": step.name_zh,
                    "step_index": state.get("step_index", 0) + 1,
                    "total_steps": state.get("total_steps", 1),
                    "platform": state.get("platform", ""),
                },
                auth_token=auth_token,
            )
        except Exception as e:
            logger.debug(f"[{execution_id}] 写入步骤开始日志失败: {e}")

    if not step.requires_openclaw:
        # 纯后端步骤（如 save_results），直接标记成功
        await emit_event(execution_id, "step_change", {
            "step_id": step_id,
            "step_name": step.name_zh,
            "status": "done",
        })
        return state

    # 构建 prompt
    prompt = step.prompt_builder(state)

    # 定义进度回调 - 将 OpenClaw SSE 数据转发给前端
    async def on_progress(delta: str, accumulated: str, screenshots: list[str]):
        await emit_event(execution_id, "progress", {
            "step_id": step_id,
            "delta": delta,
            "accumulated_text": accumulated,
            "screenshots": screenshots,
        })

    async def on_screenshot(screenshot: str):
        await emit_event(execution_id, "screenshot", {
            "step_id": step_id,
            "screenshot": screenshot,
            "action": step.name_zh,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # 截图上传器：优先上传到 Supabase Storage（持久化），无认证时回退 base64
    # _auth_token 存于 state（由各工作流的 run() 函数注入）
    uploader = make_screenshot_uploader(execution_id, auth_token)

    # 调用 OpenClaw
    result: StepResult = await openclaw.execute_step(
        prompt=prompt,
        session_id=state["session_id"],
        step_id=step_id,
        on_progress=on_progress,
        on_screenshot=on_screenshot,
        screenshot_uploader=uploader,
    )

    # 更新状态
    new_state = dict(state)
    step_results = dict(state.get("step_results", {}))
    step_results[step_id] = {
        "text": result.accumulated_text,
        "screenshots": result.screenshots,
        "persisted_screenshots": result.persisted_screenshots,
        "success": result.success,
        "error": result.error,
    }
    new_state["step_results"] = step_results
    new_state["accumulated_text"] = state.get("accumulated_text", "") + "\n" + result.accumulated_text
    new_state["all_screenshots"] = state.get("all_screenshots", []) + result.screenshots
    new_state["_persisted_screenshots"] = _dedupe_urls(
        state.get("_persisted_screenshots", []) + result.persisted_screenshots
    )
    new_state["_pending_screenshot_uploads"] = state.get("_pending_screenshot_uploads", []) + result.pending_uploads

    status_label = "完成" if result.success else "失败"

    # 立即通知前端步骤已完成/失败（不等截图补充与持久化，避免 UI 卡顿）
    if not result.success:
        new_state["error"] = result.error
        await emit_event(execution_id, "step_change", {
            "step_id": step_id,
            "step_name": step.name_zh,
            "status": "failed",
            "error": result.error,
        })
        logger.error(f"[{execution_id}] 步骤失败: {step_id} - {result.error}")
    else:
        await emit_event(execution_id, "step_change", {
            "step_id": step_id,
            "step_name": step.name_zh,
            "status": "done",
        })
        logger.info(f"[{execution_id}] 步骤完成: {step_id}")

    if task_id:
        try:
            progress = min(
                99,
                int(((state.get("step_index", 0) + 1) / max(state.get("total_steps", 1), 1)) * 100),
            )
            update_automation_task(
                task_id,
                {
                    "progress": progress,
                    "full_output": new_state.get("accumulated_text", ""),
                    "screenshot_urls": new_state.get("_persisted_screenshots", []),
                    "error_message": new_state.get("error"),
                },
                auth_token=auth_token,
            )
        except Exception as e:
            logger.debug(f"[{execution_id}] 更新任务快照失败: {e}")

    if task_id and tenant_id:
        try:
            insert_task_log(
                task_id=task_id,
                tenant_id=tenant_id,
                level="success" if result.success else "error",
                message=f"步骤{status_label}：{step.name_zh}",
                metadata={
                    "step_id": step_id,
                    "step_name": step.name_zh,
                    "success": result.success,
                    "error": result.error,
                    "screenshots_count": len(result.screenshots),
                    "text_preview": (result.accumulated_text or "")[:1000],
                },
                auth_token=auth_token,
            )
        except Exception as e:
            logger.debug(f"[{execution_id}] 写入步骤结果日志失败: {e}")

    # 若步骤无截图，后台异步补抓一张停留页面截图，避免阻塞主流程
    if not result.screenshots:
        async def capture_after_step() -> None:
            try:
                capture_result = await asyncio.wait_for(
                    openclaw.capture_screenshot(
                        session_id=state["session_id"],
                        on_screenshot=lambda screenshot: emit_event(execution_id, "screenshot", {
                            "step_id": step_id,
                            "screenshot": screenshot,
                            "action": f"{step.name_zh}（{status_label}）",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }),
                        screenshot_uploader=uploader,
                    ),
                    timeout=45.0,
                )
                pending = new_state.get("_pending_screenshot_uploads", []) + capture_result.pending_uploads
                new_state["_pending_screenshot_uploads"] = pending
                new_state["all_screenshots"] = new_state.get("all_screenshots", []) + capture_result.screenshots
                new_state["_persisted_screenshots"] = _dedupe_urls(
                    new_state.get("_persisted_screenshots", []) + capture_result.persisted_screenshots
                )
                logger.info(f"[{execution_id}] 步骤 {step_id} 补充截图完成")
            except asyncio.TimeoutError:
                logger.debug(f"[{execution_id}] 步骤 {step_id} 补充截图超时，跳过")
            except Exception as e:
                logger.debug(f"[{execution_id}] 步骤 {step_id} 补充截图失败: {e}")

        asyncio.create_task(capture_after_step(), name=f"capture-after-step-{execution_id}-{step_id}")

    return new_state


async def finalize_persisted_screenshots(state: WorkflowState) -> WorkflowState:
    pending = state.get("_pending_screenshot_uploads", [])
    if not pending:
        return state

    results = await asyncio.gather(*pending, return_exceptions=True)
    persisted = list(state.get("_persisted_screenshots", []))
    for item in results:
        if isinstance(item, str) and item and item not in persisted:
            persisted.append(item)

    new_state = dict(state)
    new_state["_persisted_screenshots"] = persisted
    new_state["_pending_screenshot_uploads"] = []
    return new_state


def _dedupe_urls(urls: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if not url or url in seen:
            continue
        seen.add(url)
        deduped.append(url)
    return deduped


def build_workflow_graph(
    steps: list[StepDefinition],
    openclaw: OpenClawClient,
    emit_event,
    is_cancelled,
):
    """
    基于步骤定义构建 LangGraph 线性执行图。

    - 每个节点执行前统一检查取消状态
    - 可见步骤自动维护 current_step / step_index / total_steps
    - 节点可通过 state["_jump_to"] 指定动态跳转目标
    """
    graph = StateGraph(WorkflowState)
    visible_steps = [step for step in steps if step.visible]
    total_visible_steps = len(visible_steps)
    visible_step_index = {
        step.node_id(): index
        for index, step in enumerate(visible_steps)
    }
    node_ids = [step.node_id() for step in steps]

    for step in steps:
        node_id = step.node_id()

        def make_node(current_step: StepDefinition, current_node_id: str):
            async def node(state: WorkflowState) -> WorkflowState:
                new_state = dict(state)
                new_state.pop("_jump_to", None)

                execution_id = new_state["execution_id"]
                if is_cancelled(execution_id):
                    if not new_state.get("cancelled"):
                        await emit_event(execution_id, "cancelled", {"message": "工作流已取消"})
                    new_state["error"] = "用户取消"
                    new_state["cancelled"] = True
                    return new_state

                if current_step.visible:
                    new_state["current_step"] = current_step.id
                    new_state["step_index"] = visible_step_index[current_node_id]
                    new_state["total_steps"] = total_visible_steps

                if current_step.executor is not None:
                    return await current_step.executor(new_state)

                return await execute_step(new_state, current_step, openclaw, emit_event)

            return node

        graph.add_node(node_id, make_node(step, node_id))

    graph.set_entry_point(node_ids[0])

    for index, step in enumerate(steps):
        current_node_id = step.node_id()
        next_node_id = node_ids[index + 1] if index + 1 < len(node_ids) else END

        def make_router(default_next: str):
            def router(state: WorkflowState):
                if state.get("cancelled") or state.get("error"):
                    return END

                jump_to = state.get("_jump_to")
                if jump_to:
                    return jump_to

                return default_next

            return router

        path_map = {node_id: node_id for node_id in node_ids}
        path_map[END] = END
        graph.add_conditional_edges(
            current_node_id,
            make_router(next_node_id),
            path_map,
        )

    return graph.compile()


async def run_workflow_graph(
    state: WorkflowState,
    steps: list[StepDefinition],
    openclaw: OpenClawClient,
    emit_event,
    is_cancelled,
) -> WorkflowState:
    """
    使用 LangGraph 运行一组步骤。
    """
    runtime = build_workflow_graph(
        steps=steps,
        openclaw=openclaw,
        emit_event=emit_event,
        is_cancelled=is_cancelled,
    )
    final_state = dict(await runtime.ainvoke(dict(state)))
    if not final_state.get("error") and not final_state.get("cancelled"):
        final_state["completed"] = True
    return final_state
