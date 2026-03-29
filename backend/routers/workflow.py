"""
工作流 API 路由

提供工作流启动、取消、状态查询和 SSE 进度流。
"""

import asyncio
import contextlib
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse
from services.openclaw_health import probe_openclaw
from services.platform_binding_service import ensure_verify_session_ready
from services.workflow_runtime_store import store as runtime_store
from services.supabase_client import (
    create_automation_task,
    complete_automation_task,
    get_platform_account,
    update_automation_task,
    validate_supabase_user,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflow", tags=["workflow"])

# ── 内存中的执行状态与事件队列 ─────────────────────────────

# execution_id -> asyncio.Queue (SSE 事件队列)
_event_queues: dict[str, asyncio.Queue] = {}
# execution_id -> 是否已取消
_cancelled: dict[str, bool] = {}
# execution_id -> asyncio.Task（用于真实取消 httpx 流式请求）
_running_tasks: dict[str, asyncio.Task] = {}
# execution_id -> task metadata（用于取消时同步更新 automation_tasks）
_task_records: dict[str, dict[str, Optional[str]]] = {}
# execution_id -> account ids
_execution_accounts: dict[str, list[str]] = {}
# account_id -> running execution_id
_account_running_executions: dict[str, str] = {}
# queued execution ids in order
_queued_execution_order: list[str] = []
# execution_id -> queued metadata
_queued_executions: dict[str, dict[str, Any]] = {}
_execution_queue_lock = asyncio.Lock()

_WORKFLOW_NAMES = {
    "publish_job": "发布招聘公告",
    "talent_explore": "市场人才探索",
    "resume_screen": "简历筛选及AI沟通",
}


def is_cancelled(execution_id: str) -> bool:
    return _cancelled.get(execution_id, False)


def _get_runtime_status(execution_id: str) -> str:
    run = runtime_store.get_run(execution_id) or {}
    status = run.get("status")
    return status if isinstance(status, str) else ""


def register_execution_task(execution_id: str, task_id: str, auth_token: Optional[str] = None):
    _task_records[execution_id] = {
        "task_id": task_id,
        "auth_token": auth_token,
    }


def get_execution_task(execution_id: str) -> dict[str, Optional[str]]:
    return dict(_task_records.get(execution_id) or {})


async def emit_event(execution_id: str, event_type: str, data: dict):
    """向指定执行的 SSE 队列推送事件"""
    runtime_store.record_event(execution_id, event_type, data)
    queue = _event_queues.get(execution_id)
    if queue:
        await queue.put({"event": event_type, "data": data})


def _emit_event_sync(execution_id: str, event_type: str, data: dict):
    """同步方式推送事件（用于 CancelledError 处理，不能 await）"""
    runtime_store.record_event(execution_id, event_type, data)
    queue = _event_queues.get(execution_id)
    if queue:
        with contextlib.suppress(Exception):
            queue.put_nowait({"event": event_type, "data": data})


def _emit_done_sync(execution_id: str):
    """同步方式标记流结束"""
    queue = _event_queues.get(execution_id)
    if queue:
        with contextlib.suppress(Exception):
            queue.put_nowait(None)


# ── 请求/响应模型 ─────────────────────────────────────────


class WorkflowStartRequest(BaseModel):
    workflow_id: str = Field(..., description="工作流 ID: publish_job, talent_explore, resume_screen")
    tenant_id: str = Field(..., description="租户 ID")
    user_id: str = Field("", description="用户 ID")

    # 平台与账号
    platform: str = Field("", description="目标平台 (单平台工作流)")
    platforms: list[str] = Field(default_factory=list, description="目标平台列表 (多平台工作流)")
    account_id: str = Field("", description="单平台工作流所使用的平台账号 ID")
    platform_account_ids: dict[str, str] = Field(default_factory=dict, description="多平台工作流的平台账号映射")
    account_name: str = Field("", description="平台账号名")
    platform_accounts: list[dict] = Field(default_factory=list, description="解析后的平台账号列表")

    # 岗位信息
    job_id: Optional[str] = None
    job_title: str = ""
    job_location: str = ""
    job_salary_min: Optional[int] = None
    job_salary_max: Optional[int] = None
    job_employment_type: str = ""
    job_department: str = ""
    job_description: str = ""
    job_requirements: str = ""
    job_benefits: str = ""

    # 企业信息
    company_name: str = ""
    company_address: str = ""
    company_size: str = ""
    company_overview: str = ""

    # Supabase 用户认证令牌（后端会先校验该用户，再以该用户身份访问 Supabase）
    supabase_auth_token: str = ""

    # 工作流特有参数
    min_match_score: int = 60
    max_results: int = 30
    message_send_limit: int = 10   # 每次运行最多发送消息数（1-50）
    custom_message: str = ""       # 自定义消息话术（空 = 使用默认）


class WorkflowStartResponse(BaseModel):
    execution_id: str
    workflow_id: str
    status: str = "starting"
    queued: bool = False
    queue_position: int = 0
    blocking_execution_count: int = 0
    message: str = "工作流已启动"


class WorkflowStatusResponse(BaseModel):
    execution_id: str
    cancelled: bool


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _workflow_name(workflow_id: str) -> str:
    return _WORKFLOW_NAMES.get(workflow_id, workflow_id)


def _collect_execution_account_ids(req: WorkflowStartRequest) -> list[str]:
    ids = [
        value
        for value in [
            req.account_id,
            *list((req.platform_account_ids or {}).values()),
            *[account.get("id", "") for account in req.platform_accounts or []],
        ]
        if isinstance(value, str) and value.strip()
    ]
    return list(dict.fromkeys(ids))


def _accounts_requiring_browser_ready(req: WorkflowStartRequest) -> list[dict[str, Any]]:
    return [
        account
        for account in (req.platform_accounts or [])
        if account.get("encrypted_session_state")
    ]


async def _ensure_execution_browser_ready(req: WorkflowStartRequest) -> Optional[dict[str, Any]]:
    for account in _accounts_requiring_browser_ready(req):
        readiness = await ensure_verify_session_ready(account=account)
        if not readiness["ready"]:
            return readiness
    return None


def _build_automation_task_name(req: WorkflowStartRequest) -> str:
    subject = req.job_title or req.account_name or req.company_name or "未命名任务"
    return f"{_workflow_name(req.workflow_id)} - {subject}"


def _build_automation_task_platform(req: WorkflowStartRequest) -> Optional[str]:
    if req.workflow_id == "resume_screen":
        platforms = req.platforms or [account.get("platform", "") for account in req.platform_accounts or []]
        normalized = [platform for platform in platforms if isinstance(platform, str) and platform.strip()]
        return ",".join(dict.fromkeys(normalized)) if normalized else None
    return req.platform or None


def _build_task_config(req: WorkflowStartRequest) -> dict[str, Any]:
    payload = req.model_dump()
    payload.pop("supabase_auth_token", None)
    return payload


def _calculate_queue_metrics(execution_id: str, account_ids: list[str]) -> tuple[int, int]:
    running_blockers = {
        running_execution_id
        for account_id in account_ids
        for running_execution_id in [_account_running_executions.get(account_id)]
        if running_execution_id and running_execution_id != execution_id
    }

    queued_blockers: list[str] = []
    for queued_execution_id in _queued_execution_order:
        if queued_execution_id == execution_id:
            break
        queued_account_ids = _execution_accounts.get(queued_execution_id, [])
        if set(account_ids).intersection(queued_account_ids) and queued_execution_id not in queued_blockers:
            queued_blockers.append(queued_execution_id)

    queue_position = len(queued_blockers) + 1
    blocking_execution_count = len(running_blockers) + len(queued_blockers)
    return queue_position, blocking_execution_count


async def _refresh_queue_positions_locked() -> None:
    for execution_id in list(_queued_execution_order):
        queued_meta = _queued_executions.get(execution_id)
        if not queued_meta:
            continue
        account_ids = queued_meta.get("account_ids") or []
        queue_position, blocking_execution_count = _calculate_queue_metrics(execution_id, account_ids)
        previous_position = queued_meta.get("last_queue_position")
        previous_blocking_count = queued_meta.get("last_blocking_execution_count")
        if previous_position == queue_position and previous_blocking_count == blocking_execution_count:
            continue

        queued_meta["last_queue_position"] = queue_position
        queued_meta["last_blocking_execution_count"] = blocking_execution_count
        event_type = "queued" if previous_position is None else "queue_status"
        await emit_event(execution_id, event_type, {
            "message": f"同账号任务排队中，前方还有 {blocking_execution_count} 个任务。",
            "queue_position": queue_position,
            "blocking_execution_count": blocking_execution_count,
            "blocking_account_ids": account_ids,
        })


def _create_execution_task_record(execution_id: str, req: WorkflowStartRequest, *, queued: bool) -> dict[str, Any]:
    if not req.tenant_id:
        return {}

    try:
        task_record = create_automation_task(
            tenant_id=req.tenant_id,
            created_by=req.user_id,
            task_type=req.workflow_id,
            name=_build_automation_task_name(req),
            config=_build_task_config(req),
            platform=_build_automation_task_platform(req),
            job_id=req.job_id,
            execution_id=execution_id,
            status="queued" if queued else "running",
            auth_token=req.supabase_auth_token or None,
        )
        if task_record.get("id"):
            register_execution_task(execution_id, task_record["id"], req.supabase_auth_token or None)
        return task_record
    except Exception:
        logger.exception("创建 automation_task 失败: %s", execution_id)
        return {}


def _start_execution_locked(
    runner,
    execution_id: str,
    req: WorkflowStartRequest,
    account_ids: list[str],
    *,
    skip_browser_ready_precheck: bool = False,
) -> None:
    _queued_executions.pop(execution_id, None)
    if execution_id in _queued_execution_order:
        _queued_execution_order.remove(execution_id)

    for account_id in account_ids:
        _account_running_executions[account_id] = execution_id

    task_meta = _task_records.get(execution_id) or {}
    task_id = task_meta.get("task_id")
    if task_id:
        try:
            update_automation_task(
                task_id,
                {
                    "status": "running",
                    "started_at": _now_iso(),
                    "completed_at": None,
                    "error_message": None,
                },
                auth_token=task_meta.get("auth_token"),
            )
        except Exception:
            logger.exception("更新 automation_task 为 running 失败: %s", execution_id)

    task = asyncio.create_task(
        _run_workflow_safe(
            runner,
            execution_id,
            req,
            skip_browser_ready_precheck=skip_browser_ready_precheck,
        ),
        name=f"workflow-{execution_id}",
    )
    _running_tasks[execution_id] = task


def _release_execution_accounts_locked(execution_id: str) -> None:
    for account_id in _execution_accounts.get(execution_id, []):
        if _account_running_executions.get(account_id) == execution_id:
            _account_running_executions.pop(account_id, None)


async def _drain_workflow_queue_locked() -> None:
    started_any = True
    while started_any:
        started_any = False
        for execution_id in list(_queued_execution_order):
            queued_meta = _queued_executions.get(execution_id)
            if not queued_meta:
                continue
            account_ids = queued_meta.get("account_ids") or []
            if any(_account_running_executions.get(account_id) for account_id in account_ids):
                continue
            _start_execution_locked(queued_meta["runner"], execution_id, queued_meta["req"], account_ids)
            started_any = True

    await _refresh_queue_positions_locked()


def _cleanup_execution_state(execution_id: str) -> None:
    _cancelled.pop(execution_id, None)
    _running_tasks.pop(execution_id, None)
    _task_records.pop(execution_id, None)
    _execution_accounts.pop(execution_id, None)
    _event_queues.pop(execution_id, None)


# ── 路由 ──────────────────────────────────────────────────


@router.post("/start", response_model=WorkflowStartResponse)
async def start_workflow(req: WorkflowStartRequest):
    """启动工作流"""
    from workflows import publish_job, talent_explore, resume_screen

    if not req.supabase_auth_token:
        raise HTTPException(status_code=401, detail="缺少 Supabase 用户令牌，无法启动工作流")

    try:
        validated_user = await validate_supabase_user(
            req.supabase_auth_token,
            expected_user_id=req.user_id or None,
            expected_tenant_id=req.tenant_id or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    # 仅信任后端校验过的用户身份，覆盖前端透传值
    req.user_id = validated_user["user_id"]
    req.tenant_id = validated_user["tenant_id"]

    # 验证 message_send_limit 范围（防止封号或异常行为）
    if not (1 <= req.message_send_limit <= 50):
        raise HTTPException(status_code=400, detail="message_send_limit 必须在 1-50 之间")

    if req.workflow_id in {"publish_job", "talent_explore"}:
        if not req.account_id:
            raise HTTPException(status_code=400, detail="未选择已绑定的平台账号")
        account = get_platform_account(req.account_id, req.tenant_id, auth_token=req.supabase_auth_token)
        if not account:
            raise HTTPException(status_code=404, detail="平台账号不存在")
        if account.get("platform") != req.platform:
            raise HTTPException(status_code=400, detail="平台账号与当前平台不匹配")
        if account.get("status") != "active" or not account.get("browser_session_key"):
            raise HTTPException(status_code=400, detail="平台账号未完成绑定或登录已失效，请先重新绑定")
        req.account_name = account.get("account_name") or account.get("name") or ""
        req.platform_accounts = [account]

    if req.workflow_id == "resume_screen":
        resolved_accounts: list[dict] = []
        for platform in req.platforms or []:
            account_id = req.platform_account_ids.get(platform, "")
            if not account_id:
                raise HTTPException(status_code=400, detail=f"平台 {platform} 未选择默认执行账号")
            account = get_platform_account(account_id, req.tenant_id, auth_token=req.supabase_auth_token)
            if not account:
                raise HTTPException(status_code=404, detail=f"平台 {platform} 的账号不存在")
            if account.get("platform") != platform:
                raise HTTPException(status_code=400, detail=f"平台 {platform} 的账号配置不匹配")
            if account.get("status") != "active" or not account.get("browser_session_key"):
                raise HTTPException(status_code=400, detail=f"平台 {platform} 的账号未完成绑定或登录已失效")
            resolved_accounts.append(account)
        req.platform_accounts = resolved_accounts

    execution_id = str(uuid4())

    runner_map = {
        "publish_job": publish_job.run,
        "talent_explore": talent_explore.run,
        "resume_screen": resume_screen.run,
    }

    runner = runner_map.get(req.workflow_id)
    if not runner:
        raise HTTPException(status_code=400, detail=f"未知工作流: {req.workflow_id}")

    account_ids = _collect_execution_account_ids(req)

    async with _execution_queue_lock:
        should_queue = any(_account_running_executions.get(account_id) for account_id in account_ids)

        if should_queue:
            _event_queues[execution_id] = asyncio.Queue()
            _cancelled[execution_id] = False
            _execution_accounts[execution_id] = account_ids
            task_record = _create_execution_task_record(execution_id, req, queued=True)
            runtime_store.init_run(
                execution_id,
                req.workflow_id,
                req.model_dump(),
                tenant_id=req.tenant_id,
                auth_token=req.supabase_auth_token or None,
                task_id=task_record.get("id") or None,
                initial_status="queued",
            )
            _queued_executions[execution_id] = {
                "runner": runner,
                "req": req,
                "account_ids": account_ids,
                "last_queue_position": None,
                "last_blocking_execution_count": None,
            }
            _queued_execution_order.append(execution_id)
            await _refresh_queue_positions_locked()
            queue_position, blocking_execution_count = _calculate_queue_metrics(execution_id, account_ids)
            return WorkflowStartResponse(
                execution_id=execution_id,
                workflow_id=req.workflow_id,
                status="queued",
                queued=True,
                queue_position=queue_position,
                blocking_execution_count=blocking_execution_count,
                message=f"同账号已有任务执行中，已进入队列，前方还有 {blocking_execution_count} 个任务。",
            )

        _execution_accounts[execution_id] = account_ids
        for account_id in account_ids:
            _account_running_executions[account_id] = execution_id

    readiness = await _ensure_execution_browser_ready(req)
    if readiness:
        async with _execution_queue_lock:
            _release_execution_accounts_locked(execution_id)
            _execution_accounts.pop(execution_id, None)
            await _drain_workflow_queue_locked()
        raise HTTPException(status_code=readiness["http_status"], detail=readiness["detail"])

    async with _execution_queue_lock:
        _event_queues[execution_id] = asyncio.Queue()
        _cancelled[execution_id] = False
        task_record = _create_execution_task_record(execution_id, req, queued=False)
        runtime_store.init_run(
            execution_id,
            req.workflow_id,
            req.model_dump(),
            tenant_id=req.tenant_id,
            auth_token=req.supabase_auth_token or None,
            task_id=task_record.get("id") or None,
            initial_status="starting",
        )
        _start_execution_locked(
            runner,
            execution_id,
            req,
            account_ids,
            skip_browser_ready_precheck=True,
        )

    return WorkflowStartResponse(
        execution_id=execution_id,
        workflow_id=req.workflow_id,
        status="starting",
    )


@router.post("/cancel/{execution_id}")
async def cancel_workflow(execution_id: str):
    """取消工作流 - 立即中断 httpx 流式请求"""
    runtime_status = _get_runtime_status(execution_id)
    if (
        execution_id not in _event_queues
        and execution_id not in _running_tasks
        and execution_id not in _task_records
        and not runtime_status
    ):
        raise HTTPException(status_code=404, detail="执行不存在")

    if runtime_status in {"completed", "failed", "cancelled"} and execution_id not in _running_tasks:
        return {"message": f"工作流已结束({runtime_status})"}

    async with _execution_queue_lock:
        _cancelled[execution_id] = True
        runtime_store.record_event(execution_id, "cancel_requested", {"message": "已发送取消请求"})

        if execution_id in _queued_executions:
            _queued_executions.pop(execution_id, None)
            if execution_id in _queued_execution_order:
                _queued_execution_order.remove(execution_id)
            _emit_event_sync(execution_id, "cancelled", {"message": "排队任务已取消"})
            _emit_done_sync(execution_id)

            task_meta = _task_records.get(execution_id) or {}
            task_id = task_meta.get("task_id")
            if task_id:
                try:
                    complete_automation_task(
                        task_id,
                        "cancelled",
                        error_message="用户取消排队任务",
                        auth_token=task_meta.get("auth_token"),
                    )
                except Exception:
                    logger.exception("同步取消排队 automation_task 失败: %s", execution_id)

            await _refresh_queue_positions_locked()
            _cleanup_execution_state(execution_id)
            return {"message": "已取消排队任务"}

        task = _running_tasks.get(execution_id)
        if task and not task.done():
            task.cancel()
            logger.info(f"已发送取消信号: {execution_id}")
        elif runtime_status and runtime_status not in {"completed", "failed", "cancelled"}:
            runtime_store.record_event(execution_id, "cancelled", {"message": "工作流已取消"})

    return {"message": "已发送取消请求"}


@router.get("/stream/{execution_id}")
async def stream_progress(execution_id: str):
    """SSE 事件流 - 前端通过 EventSource 订阅"""
    if execution_id not in _event_queues:
        raise HTTPException(status_code=404, detail="执行不存在")

    async def event_generator():
        queue = _event_queues[execution_id]
        try:
            while True:
                event = await asyncio.wait_for(queue.get(), timeout=600)
                if event is None:  # sentinel = stream done
                    break
                yield {
                    "event": event["event"],
                    "data": json.dumps(event["data"], ensure_ascii=False),
                }
        except asyncio.TimeoutError:
            yield {
                "event": "error",
                "data": json.dumps({"message": "SSE 超时"}, ensure_ascii=False),
            }
        except asyncio.CancelledError:
            # 客户端（浏览器）断开连接，取消后台工作流任务避免资源泄漏
            logger.info(f"SSE 客户端断开，取消工作流任务: {execution_id}")
            task = _running_tasks.get(execution_id)
            if task and not task.done():
                task.cancel()

    return EventSourceResponse(event_generator())


@router.get("/check-openclaw")
async def check_openclaw_connection():
    """检查 OpenClaw Gateway 连通性（账号验证时调用）"""
    status = await probe_openclaw()
    if status["status"] != "ok":
        raise HTTPException(status_code=503, detail=status["detail"])
    return {"status": "ok", "endpoint": status["endpoint"]}


@router.get("/status/{execution_id}", response_model=WorkflowStatusResponse)
async def get_status(execution_id: str):
    """查询执行状态"""
    runtime_status = _get_runtime_status(execution_id)
    return WorkflowStatusResponse(
        execution_id=execution_id,
        cancelled=is_cancelled(execution_id) or runtime_status == "cancelled",
    )


# ── 内部辅助 ──────────────────────────────────────────────


async def _run_workflow_safe(
    runner,
    execution_id: str,
    req: WorkflowStartRequest,
    *,
    skip_browser_ready_precheck: bool = False,
):
    """
    安全运行工作流，处理三种结束情形：
    1. 正常完成：runner 自行发送 complete/error 事件
    2. 用户取消：task.cancel() 抛出 CancelledError，发送 cancelled 事件
    3. 未捕获异常：发送 error 事件
    """
    try:
        if not skip_browser_ready_precheck:
            readiness = await _ensure_execution_browser_ready(req)
            if readiness:
                detail = readiness["detail"]
                await emit_event(execution_id, "error", {
                    "step_id": "browser_ready",
                    "message": detail,
                    "error_code": "TOOL_ERROR",
                })
                await emit_event(execution_id, "run_failed", {
                    "execution_id": execution_id,
                    "workflow_id": req.workflow_id,
                    "message": detail,
                    "error_code": "TOOL_ERROR",
                })
                task_meta = _task_records.get(execution_id) or {}
                task_id = task_meta.get("task_id")
                if task_id:
                    try:
                        complete_automation_task(
                            task_id,
                            "failed",
                            error_message=detail,
                            auth_token=task_meta.get("auth_token"),
                        )
                    except Exception:
                        logger.exception("同步 browser-ready 失败 automation_task 失败: %s", execution_id)
                return
        await runner(execution_id, req)
    except asyncio.CancelledError:
        # 用同步 put_nowait，避免在 cancelled 状态下再次 await 失败
        logger.info(f"工作流已被取消: {execution_id}")
        _emit_event_sync(execution_id, "cancelled", {"message": "工作流已取消"})
        task_meta = _task_records.get(execution_id) or {}
        task_id = task_meta.get("task_id")
        if task_id:
            try:
                complete_automation_task(
                    task_id,
                    "cancelled",
                    error_message="用户取消",
                    auth_token=task_meta.get("auth_token"),
                )
            except Exception:
                logger.exception("同步取消 automation_task 失败: %s", execution_id)
        # 不重新 raise，让 finally 正常运行
    except Exception as e:
        logger.exception(f"工作流执行异常: {execution_id}")
        _emit_event_sync(execution_id, "error", {
            "step_id": "unknown",
            "message": f"工作流执行异常: {str(e)}",
        })
        task_meta = _task_records.get(execution_id) or {}
        task_id = task_meta.get("task_id")
        if task_id:
            try:
                complete_automation_task(
                    task_id,
                    "failed",
                    error_message=f"工作流执行异常: {str(e)}",
                    auth_token=task_meta.get("auth_token"),
                )
            except Exception:
                logger.exception("同步失败 automation_task 失败: %s", execution_id)
    finally:
        _emit_done_sync(execution_id)
        async with _execution_queue_lock:
            _release_execution_accounts_locked(execution_id)
            await _drain_workflow_queue_locked()
            _cleanup_execution_state(execution_id)
