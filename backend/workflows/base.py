"""
工作流基础设施

定义通用的工作流状态、步骤执行逻辑与 LangGraph 运行时，供三个工作流复用。
"""

import asyncio
import hashlib
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional, TypedDict
from uuid import uuid4

from langgraph.graph import END, StateGraph

from services.openclaw_client import OpenClawClient, StepResult
from services.supabase_client import make_screenshot_uploader, insert_task_log, update_automation_task
from workflows.contracts import (
    ArtifactRef,
    ERROR_AUTH_REQUIRED,
    RetryPolicy,
    StepVerificationOutcome,
    default_step_verifier,
    extract_storage_key,
    infer_error_code,
)

logger = logging.getLogger(__name__)


def _normalize_runtime_token(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", (value or "").strip())
    normalized = normalized.strip("-._")
    return normalized or "workflow"


def build_execution_session_id(browser_session_key: str, execution_id: str, platform: str = "") -> str:
    base_key = _normalize_runtime_token(browser_session_key)
    exec_suffix = _normalize_runtime_token(execution_id)[:12]
    platform_suffix = _normalize_runtime_token(platform) if platform else ""
    if platform_suffix:
        return f"{base_key}--{platform_suffix}--{exec_suffix}"
    return f"{base_key}--{exec_suffix}"


def build_execution_browser_profile(session_id: str) -> str:
    digest = hashlib.sha1((session_id or "workflow").encode("utf-8")).hexdigest()[:20]
    return f"wf-{digest}"


# ── 工作流状态 (LangGraph State) ──────────────────────────


class WorkflowState(TypedDict, total=False):
    """LangGraph 工作流状态"""
    # 执行标识
    execution_id: str
    workflow_id: str
    session_id: str
    browser_profile: str

    # 当前执行位置
    current_step: str
    step_index: int
    total_steps: int

    # 平台与账号
    platform: str
    platform_url: str
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
    message_send_limit: int
    custom_message: str

    # 执行结果
    step_results: dict[str, dict]  # step_id -> {text, screenshots, success}
    accumulated_text: str
    all_screenshots: list[str]
    parsed_candidates: list[dict]
    announcement_text: str
    publish_result: dict
    result_summary: dict
    artifacts: list[dict]
    checkpoints: list[dict]
    latest_checkpoint: Optional[dict]
    step_attempts: dict[str, int]
    current_error_code: Optional[str]

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
    preconditions: list[str] = field(default_factory=list)
    success_assertions: list[str] = field(default_factory=list)
    failure_assertions: list[str] = field(default_factory=list)
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    timeout_seconds: float = 300.0
    screenshot_policy: str = "after_action"
    escalation_policy: str = "handoff_on_failure"
    verifier: Optional[Callable[[WorkflowState, StepResult], StepVerificationOutcome]] = None
    template_id: Optional[str] = None

    def node_id(self) -> str:
        return self.graph_id or self.id


# ── 步骤执行器 ────────────────────────────────────────────


async def execute_step(
    state: WorkflowState,
    step: StepDefinition,
    openclaw: OpenClawClient,
    emit_event,
) -> WorkflowState:
    """执行单个工作流步骤，并做标准化校验、重试、产物登记与 checkpoint。"""
    step_id = step.id
    execution_id = state["execution_id"]
    task_id = state.get("_task_id") or ""
    tenant_id = state.get("_tenant_id") or ""
    auth_token = state.get("_auth_token") or None
    retry_policy = step.retry_policy or RetryPolicy()

    await emit_event(execution_id, "step_change", {
        "step_id": step_id,
        "step_name": step.name_zh,
        "status": "running",
        "step_index": state.get("step_index", 0),
        "total_steps": state.get("total_steps", 1),
        "platform": state.get("platform", ""),
        "attempt": 1,
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
        await emit_event(execution_id, "step_verified", {
            "step_id": step_id,
            "step_name": step.name_zh,
            "verified": True,
            "attempt": 1,
        })
        await emit_event(execution_id, "step_change", {
            "step_id": step_id,
            "step_name": step.name_zh,
            "status": "done",
        })
        return state

    prompt = step.prompt_builder(state)
    uploader = make_screenshot_uploader(execution_id, auth_token)

    all_step_artifacts: list[ArtifactRef] = []
    step_live_screenshots: list[str] = []
    persisted_urls: list[str] = []
    pending_uploads: list[asyncio.Task] = []
    attempts = dict(state.get("step_attempts", {}))
    last_result: Optional[StepResult] = None
    verification = StepVerificationOutcome(success=False, error="步骤未执行", error_code=infer_error_code(step_id=step_id))

    for attempt in range(1, retry_policy.max_attempts + 1):
        attempts[step_id] = attempt
        current_attempt_artifacts: list[ArtifactRef] = []

        async def on_progress(delta: str, accumulated: str, screenshots: list[str]):
            await emit_event(execution_id, "progress", {
                "step_id": step_id,
                "delta": delta,
                "accumulated_text": accumulated,
                "screenshots": screenshots,
                "attempt": attempt,
            })

        async def on_screenshot(screenshot: str):
            artifact = ArtifactRef.create(
                run_id=execution_id,
                step_id=step_id,
                capture_phase=step.screenshot_policy,
                preview_url=screenshot,
                live_url=screenshot,
            )
            current_attempt_artifacts.append(artifact)
            step_live_screenshots.append(screenshot)
            await emit_event(execution_id, "artifact_created", artifact.to_event())
            await emit_event(execution_id, "screenshot", {
                "step_id": step_id,
                "screenshot": screenshot,
                "action": step.name_zh,
                "timestamp": artifact.captured_at,
                "artifact_id": artifact.artifact_id,
            })

        last_result = await openclaw.execute_step(
            prompt=prompt,
            session_id=state["session_id"],
            step_id=step_id,
            on_progress=on_progress,
            on_screenshot=on_screenshot,
            screenshot_uploader=uploader,
        )
        all_step_artifacts.extend(current_attempt_artifacts)
        persisted_urls.extend(last_result.persisted_screenshots or [])
        pending_uploads.extend(last_result.pending_uploads or [])

        for artifact, persisted_url in zip(current_attempt_artifacts, last_result.persisted_screenshots or []):
            artifact.signed_url = persisted_url
            artifact.storage_key = extract_storage_key(persisted_url)
            await emit_event(execution_id, "artifact_persisted", artifact.to_event())

        verification = _verify_step_result(state, step, last_result)
        await emit_event(execution_id, "step_verified", {
            "step_id": step_id,
            "step_name": step.name_zh,
            "verified": verification.success,
            "attempt": attempt,
            "error_code": verification.error_code,
            "message": verification.error,
            "details": verification.details,
        })

        if verification.success:
            break

        if (
            attempt < retry_policy.max_attempts
            and (verification.error_code or infer_error_code(step_id=step_id)) in retry_policy.retriable_codes
        ):
            await emit_event(execution_id, "step_retrying", {
                "step_id": step_id,
                "step_name": step.name_zh,
                "attempt": attempt + 1,
                "previous_error": verification.error,
                "error_code": verification.error_code,
            })
            await asyncio.sleep(retry_policy.backoff_seconds * attempt)
            continue

        break

    result = last_result or StepResult(success=False, accumulated_text="", screenshots=[], error="步骤未执行")
    verified_success = verification.success
    error_message = verification.error or result.error
    error_code = verification.error_code or infer_error_code(error_message or "", result.accumulated_text, step_id)

    new_state = dict(state)
    step_results = dict(state.get("step_results", {}))
    step_results[step_id] = {
        "text": result.accumulated_text,
        "screenshots": step_live_screenshots,
        "persisted_screenshots": persisted_urls,
        "success": verified_success,
        "error": error_message,
        "error_code": error_code,
        "attempts": attempts.get(step_id, 1),
        "verified": verified_success,
        "artifacts": [artifact.to_event() for artifact in all_step_artifacts],
    }
    new_state["step_results"] = step_results
    new_state["step_attempts"] = attempts
    new_state["artifacts"] = state.get("artifacts", []) + [artifact.to_event() for artifact in all_step_artifacts]
    new_state["accumulated_text"] = state.get("accumulated_text", "") + "\n" + result.accumulated_text
    new_state["all_screenshots"] = state.get("all_screenshots", []) + step_live_screenshots
    new_state["_persisted_screenshots"] = _dedupe_urls(state.get("_persisted_screenshots", []) + persisted_urls)
    new_state["_pending_screenshot_uploads"] = state.get("_pending_screenshot_uploads", []) + pending_uploads

    status_label = "完成" if verified_success else "失败"

    if not verified_success:
        new_state["error"] = error_message
        new_state["current_error_code"] = error_code
        await emit_event(execution_id, "step_change", {
            "step_id": step_id,
            "step_name": step.name_zh,
            "status": "failed",
            "error": error_message,
            "error_code": error_code,
        })
        logger.error(f"[{execution_id}] 步骤失败: {step_id} - {error_message} ({error_code})")
        if error_code == ERROR_AUTH_REQUIRED:
            await emit_event(execution_id, "handoff_required", {
                "step_id": step_id,
                "step_name": step.name_zh,
                "reason": error_message or "登录态失效，需要人工介入",
                "error_code": error_code,
                "escalation_policy": step.escalation_policy,
            })
    else:
        checkpoint = {
            "checkpoint_id": f"checkpoint_{uuid4().hex}",
            "execution_id": execution_id,
            "step_id": step_id,
            "step_name": step.name_zh,
            "step_index": state.get("step_index", 0),
            "attempt": attempts.get(step_id, 1),
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "artifact_ids": [artifact.artifact_id for artifact in all_step_artifacts],
        }
        new_state["checkpoints"] = state.get("checkpoints", []) + [checkpoint]
        new_state["latest_checkpoint"] = checkpoint
        new_state["current_error_code"] = None
        await emit_event(execution_id, "checkpoint_saved", checkpoint)
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
                level="success" if verified_success else "error",
                message=f"步骤{status_label}：{step.name_zh}",
                metadata={
                    "step_id": step_id,
                    "step_name": step.name_zh,
                    "success": verified_success,
                    "error": error_message,
                    "error_code": error_code,
                    "attempts": attempts.get(step_id, 1),
                    "screenshots_count": len(step_live_screenshots),
                    "text_preview": (result.accumulated_text or "")[:1000],
                },
                auth_token=auth_token,
            )
        except Exception as e:
            logger.debug(f"[{execution_id}] 写入步骤结果日志失败: {e}")

    if not step_live_screenshots:
        async def capture_after_step() -> None:
            try:
                extra_artifacts: list[ArtifactRef] = []
                capture_source = "host_browser_cdp"

                async def emit_capture_screenshot(screenshot: str):
                    artifact = ArtifactRef.create(
                        run_id=execution_id,
                        step_id=step_id,
                        capture_phase="after_action",
                        source=capture_source,
                        preview_url=screenshot,
                        live_url=screenshot,
                    )
                    extra_artifacts.append(artifact)
                    await emit_event(execution_id, "artifact_created", artifact.to_event())
                    await emit_event(execution_id, "screenshot", {
                        "step_id": step_id,
                        "screenshot": screenshot,
                        "action": f"{step.name_zh}（{status_label}）",
                        "timestamp": artifact.captured_at,
                        "artifact_id": artifact.artifact_id,
                    })

                capture_result = await asyncio.wait_for(
                    openclaw.capture_host_browser_screenshot(
                        session_id=state["session_id"],
                        profile=state.get("browser_profile"),
                        on_screenshot=emit_capture_screenshot,
                        screenshot_uploader=uploader,
                    ),
                    timeout=20.0,
                )

                if not capture_result.success or not capture_result.screenshots:
                    if capture_result.error:
                        logger.debug(f"[{execution_id}] 步骤 {step_id} CDP 补充截图失败，回退 agent：{capture_result.error}")
                    capture_source = "openclaw_browser"
                    capture_result = await asyncio.wait_for(
                        openclaw.capture_screenshot(
                            session_id=state["session_id"],
                            on_screenshot=emit_capture_screenshot,
                            screenshot_uploader=uploader,
                        ),
                        timeout=45.0,
                    )

                if not capture_result.success or not capture_result.screenshots:
                    logger.debug(
                        f"[{execution_id}] 步骤 {step_id} 补充截图未产出有效结果: {capture_result.error or 'empty result'}"
                    )
                    return

                for artifact, persisted_url in zip(extra_artifacts, capture_result.persisted_screenshots or []):
                    artifact.signed_url = persisted_url
                    artifact.storage_key = extract_storage_key(persisted_url)
                    await emit_event(execution_id, "artifact_persisted", artifact.to_event())

                new_state["_pending_screenshot_uploads"] = new_state.get("_pending_screenshot_uploads", []) + capture_result.pending_uploads
                new_state["all_screenshots"] = new_state.get("all_screenshots", []) + capture_result.screenshots
                new_state["artifacts"] = new_state.get("artifacts", []) + [artifact.to_event() for artifact in extra_artifacts]
                new_state["_persisted_screenshots"] = _dedupe_urls(
                    new_state.get("_persisted_screenshots", []) + (capture_result.persisted_screenshots or [])
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


def _verify_step_result(
    state: WorkflowState,
    step: StepDefinition,
    result: StepResult,
) -> StepVerificationOutcome:
    if step.verifier is not None:
        outcome = step.verifier(state, result)
    else:
        outcome = default_step_verifier(step.id, result.accumulated_text, result.error)

    text = result.accumulated_text or ""
    if outcome.success and step.success_assertions:
        missing = [item for item in step.success_assertions if item not in text]
        if missing:
            return StepVerificationOutcome(
                success=False,
                error=f"步骤 {step.id} 未满足成功断言: {', '.join(missing)}",
                error_code=infer_error_code(",".join(missing), text, step.id),
                details={"missing_success_assertions": missing},
            )

    if step.failure_assertions:
        hit = [item for item in step.failure_assertions if item in text]
        if hit:
            return StepVerificationOutcome(
                success=False,
                error=f"步骤 {step.id} 命中失败断言: {', '.join(hit)}",
                error_code=infer_error_code(",".join(hit), text, step.id),
                details={"hit_failure_assertions": hit},
            )

    if not outcome.error_code and not outcome.success:
        outcome.error_code = infer_error_code(outcome.error or result.error or "", text, step.id)
    return outcome


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
