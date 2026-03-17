"""
工作流 API 路由

提供工作流启动、取消、状态查询和 SSE 进度流。
"""

import asyncio
import json
import logging
from uuid import uuid4
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflow", tags=["workflow"])

# ── 内存中的执行状态与事件队列 ─────────────────────────────

# execution_id -> asyncio.Queue (SSE 事件队列)
_event_queues: dict[str, asyncio.Queue] = {}
# execution_id -> 是否已取消
_cancelled: dict[str, bool] = {}


def get_event_queue(execution_id: str) -> asyncio.Queue:
    if execution_id not in _event_queues:
        _event_queues[execution_id] = asyncio.Queue()
    return _event_queues[execution_id]


def is_cancelled(execution_id: str) -> bool:
    return _cancelled.get(execution_id, False)


async def emit_event(execution_id: str, event_type: str, data: dict):
    """向指定执行的 SSE 队列推送事件"""
    queue = _event_queues.get(execution_id)
    if queue:
        await queue.put({"event": event_type, "data": data})


async def emit_done(execution_id: str):
    """标记 SSE 流结束"""
    queue = _event_queues.get(execution_id)
    if queue:
        await queue.put(None)  # sentinel


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
async def start_workflow(req: WorkflowStartRequest, background_tasks: BackgroundTasks):
    """启动工作流"""
    from workflows import publish_job, talent_explore, resume_screen

    execution_id = str(uuid4())
    _event_queues[execution_id] = asyncio.Queue()
    _cancelled[execution_id] = False

    # 根据 workflow_id 选择工作流执行函数
    runner_map = {
        "publish_job": publish_job.run,
        "talent_explore": talent_explore.run,
        "resume_screen": resume_screen.run,
    }

    runner = runner_map.get(req.workflow_id)
    if not runner:
        raise HTTPException(status_code=400, detail=f"未知工作流: {req.workflow_id}")

    # 在后台任务中运行工作流
    background_tasks.add_task(
        _run_workflow_safe,
        runner,
        execution_id,
        req,
    )

    return WorkflowStartResponse(
        execution_id=execution_id,
        workflow_id=req.workflow_id,
    )


@router.post("/cancel/{execution_id}")
async def cancel_workflow(execution_id: str):
    """取消工作流"""
    if execution_id not in _event_queues:
        raise HTTPException(status_code=404, detail="执行不存在")
    _cancelled[execution_id] = True
    await emit_event(execution_id, "cancelled", {"message": "工作流已取消"})
    await emit_done(execution_id)
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
            # 清理
            _event_queues.pop(execution_id, None)
            _cancelled.pop(execution_id, None)

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
    """安全运行工作流，捕获异常并推送错误事件"""
    try:
        await runner(execution_id, req)
    except Exception as e:
        logger.exception(f"工作流执行异常: {execution_id}")
        await emit_event(execution_id, "error", {
            "step_id": "unknown",
            "message": f"工作流执行异常: {str(e)}",
        })
    finally:
        await emit_done(execution_id)
