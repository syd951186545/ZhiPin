"""
工作流 API 路由

提供工作流启动、取消、状态查询和 SSE 进度流。
"""

import asyncio
import contextlib
import json
import logging
from uuid import uuid4
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse
from services.openclaw_health import probe_openclaw
from services.platform_binding_service import ensure_verify_session_ready
from services.workflow_runtime_store import store as runtime_store
from services.supabase_client import (
    complete_automation_task,
    get_platform_account,
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
    message: str = "工作流已启动"


class WorkflowStatusResponse(BaseModel):
    execution_id: str
    cancelled: bool


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

    for account in req.platform_accounts:
        if not account.get("encrypted_session_state"):
            continue
        readiness = await ensure_verify_session_ready(account=account)
        if not readiness["ready"]:
            raise HTTPException(status_code=readiness["http_status"], detail=readiness["detail"])

    execution_id = str(uuid4())
    _event_queues[execution_id] = asyncio.Queue()
    _cancelled[execution_id] = False
    runtime_store.init_run(
        execution_id,
        req.workflow_id,
        req.model_dump(),
        tenant_id=req.tenant_id,
        auth_token=req.supabase_auth_token or None,
    )

    runner_map = {
        "publish_job": publish_job.run,
        "talent_explore": talent_explore.run,
        "resume_screen": resume_screen.run,
    }

    runner = runner_map.get(req.workflow_id)
    if not runner:
        raise HTTPException(status_code=400, detail=f"未知工作流: {req.workflow_id}")

    # 用 asyncio.create_task 代替 BackgroundTasks，可以通过 task.cancel() 真实中断
    task = asyncio.create_task(
        _run_workflow_safe(runner, execution_id, req),
        name=f"workflow-{execution_id}",
    )
    _running_tasks[execution_id] = task

    return WorkflowStartResponse(
        execution_id=execution_id,
        workflow_id=req.workflow_id,
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

    _cancelled[execution_id] = True
    runtime_store.record_event(execution_id, "cancel_requested", {"message": "已发送取消请求"})

    # 取消实际运行的 asyncio Task，这会中断 httpx 的 async for 流式读取
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


async def _run_workflow_safe(runner, execution_id: str, req: WorkflowStartRequest):
    """
    安全运行工作流，处理三种结束情形：
    1. 正常完成：runner 自行发送 complete/error 事件
    2. 用户取消：task.cancel() 抛出 CancelledError，发送 cancelled 事件
    3. 未捕获异常：发送 error 事件
    """
    try:
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
    finally:
        _emit_done_sync(execution_id)
        _cancelled.pop(execution_id, None)
        _running_tasks.pop(execution_id, None)
        _task_records.pop(execution_id, None)
        _event_queues.pop(execution_id, None)
