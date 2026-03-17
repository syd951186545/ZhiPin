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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflow", tags=["workflow"])

# ── 内存中的执行状态与事件队列 ─────────────────────────────

# execution_id -> asyncio.Queue (SSE 事件队列)
_event_queues: dict[str, asyncio.Queue] = {}
# execution_id -> 是否已取消
_cancelled: dict[str, bool] = {}
# execution_id -> asyncio.Task（用于真实取消 httpx 流式请求）
_running_tasks: dict[str, asyncio.Task] = {}


def is_cancelled(execution_id: str) -> bool:
    return _cancelled.get(execution_id, False)


async def emit_event(execution_id: str, event_type: str, data: dict):
    """向指定执行的 SSE 队列推送事件"""
    queue = _event_queues.get(execution_id)
    if queue:
        await queue.put({"event": event_type, "data": data})


def _emit_event_sync(execution_id: str, event_type: str, data: dict):
    """同步方式推送事件（用于 CancelledError 处理，不能 await）"""
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
    account_name: str = Field("", description="平台账号名")

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

    # OpenClaw 配置（可覆盖全局配置）
    openclaw_base_url: str = ""
    openclaw_auth_token: str = ""

    # Supabase 用户认证令牌（用于后端以用户身份写入数据库，绕过 RLS）
    supabase_auth_token: str = ""

    # 工作流特有参数
    min_match_score: int = 60
    max_results: int = 30


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

    execution_id = str(uuid4())
    _event_queues[execution_id] = asyncio.Queue()
    _cancelled[execution_id] = False

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
    if execution_id not in _event_queues:
        raise HTTPException(status_code=404, detail="执行不存在")

    _cancelled[execution_id] = True

    # 取消实际运行的 asyncio Task，这会中断 httpx 的 async for 流式读取
    task = _running_tasks.get(execution_id)
    if task and not task.done():
        task.cancel()
        logger.info(f"已发送取消信号: {execution_id}")

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
        finally:
            _event_queues.pop(execution_id, None)
            _cancelled.pop(execution_id, None)
            _running_tasks.pop(execution_id, None)

    return EventSourceResponse(event_generator())


@router.get("/status/{execution_id}", response_model=WorkflowStatusResponse)
async def get_status(execution_id: str):
    """查询执行状态"""
    return WorkflowStatusResponse(
        execution_id=execution_id,
        cancelled=is_cancelled(execution_id),
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
        # 不重新 raise，让 finally 正常运行
    except Exception as e:
        logger.exception(f"工作流执行异常: {execution_id}")
        _emit_event_sync(execution_id, "error", {
            "step_id": "unknown",
            "message": f"工作流执行异常: {str(e)}",
        })
    finally:
        _running_tasks.pop(execution_id, None)
        _emit_done_sync(execution_id)
