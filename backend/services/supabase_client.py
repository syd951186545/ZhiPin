"""
Supabase 客户端封装

负责向 Supabase 写入候选人、任务日志、自动化任务等数据，
以及将工作流截图上传到 Storage bucket。
"""

import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from supabase import create_client, Client

from config import get_settings

logger = logging.getLogger(__name__)

_anon_client: Optional[Client] = None
_service_client: Optional[Client] = None

SCREENSHOTS_BUCKET = "workflow-screenshots"


def get_supabase(auth_token: Optional[str] = None) -> Client:
    """
    获取 Supabase 客户端。

    如果提供了 auth_token（用户 JWT），则以用户身份操作（满足 RLS 策略）。
    否则返回匿名客户端单例（受 RLS 限制）。
    """
    global _anon_client
    settings = get_settings()

    if auth_token:
        # 创建带用户 JWT 的客户端，postgrest 会携带 Authorization: Bearer <token>
        client = create_client(settings.supabase_url, settings.supabase_anon_key)
        client.postgrest.auth(auth_token)
        return client

    if _anon_client is None:
        _anon_client = create_client(settings.supabase_url, settings.supabase_anon_key)
    return _anon_client


def get_service_supabase() -> Optional[Client]:
    """
    获取 service_role 级别的 Supabase 客户端（绕过所有 RLS 策略）。
    可选：.env 中配置 SUPABASE_SERVICE_KEY 时启用。
    """
    global _service_client
    settings = get_settings()
    if not settings.supabase_service_key:
        return None
    if _service_client is None:
        _service_client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _service_client


# ── Storage ───────────────────────────────────────────────


async def upload_screenshot(
    image_bytes: bytes,
    filename: str,
    content_type: str = "image/png",
    execution_id: str = "",
    auth_token: Optional[str] = None,
) -> Optional[str]:
    """
    上传截图到 Supabase Storage (workflow-screenshots bucket)。

    认证优先级：
      1. .env 中配置了 SUPABASE_SERVICE_KEY → 使用 service_role（绕过 RLS）
      2. 传入了 auth_token（用户 JWT）→ 以认证用户身份上传（满足 RLS authenticated 策略）
      3. 以上均无 → 返回 None，调用方回退到 base64

    存储路径: {execution_id}/{timestamp}_{filename}
    返回公开访问 URL，失败返回 None。
    """
    settings = get_settings()

    # 决定使用哪个 Bearer token
    if settings.supabase_service_key:
        bearer = settings.supabase_service_key
        logger.debug("使用 service_role key 上传截图")
    elif auth_token:
        bearer = auth_token
        logger.debug("使用用户 JWT 上传截图")
    else:
        logger.debug("无可用认证 token，跳过 Storage 上传")
        return None

    # 构建唯一存储路径
    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    ts = int(time.time() * 1000)
    folder = execution_id or f"ts_{ts}"
    storage_path = f"{folder}/{ts}_{safe_name}"

    # 直接调用 Supabase Storage REST API（不依赖 supabase-py 的 session 状态）
    storage_base = settings.supabase_url.rstrip("/") + "/storage/v1"
    upload_url = f"{storage_base}/object/{SCREENSHOTS_BUCKET}/{storage_path}"
    public_url = f"{storage_base}/object/public/{SCREENSHOTS_BUCKET}/{storage_path}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                upload_url,
                content=image_bytes,
                headers={
                    "Authorization": f"Bearer {bearer}",
                    "apikey": settings.supabase_anon_key,
                    "Content-Type": content_type,
                    "x-upsert": "true",
                },
            )
            resp.raise_for_status()
        logger.info(f"截图已上传 Storage: {storage_path}")
        return public_url
    except Exception as e:
        logger.warning(f"截图上传 Supabase Storage 失败 ({storage_path}): {e}")
        return None


def make_screenshot_uploader(execution_id: str, auth_token: Optional[str] = None):
    """
    创建截图上传 callback，供 OpenClawClient.execute_step 使用。

    返回值是 async callable: (bytes, filename, content_type) -> Optional[str]
    若 Storage 上传失败，openclaw_client 会自动回退 base64。
    """
    async def _uploader(image_bytes: bytes, filename: str, content_type: str) -> Optional[str]:
        return await upload_screenshot(image_bytes, filename, content_type, execution_id, auth_token)
    return _uploader


# ── Candidates ────────────────────────────────────────────


def create_candidates_batch(
    tenant_id: str,
    candidates: list[dict],
    auth_token: Optional[str] = None,
) -> list[dict]:
    """
    批量写入候选人记录（全部新建，不去重）。

    每个 candidate dict 应包含:
        name, source, stage, job_id,
        ai_match_score?, ai_analysis?, email?, phone?, notes?, tags?, metadata?
    """
    sb = get_supabase(auth_token)
    rows = []
    for c in candidates:
        rows.append({
            "tenant_id": tenant_id,
            "job_id": c.get("job_id"),
            "name": c.get("name", "未知"),
            "email": c.get("email"),
            "phone": c.get("phone"),
            "source": c.get("source", "openclaw_auto"),
            "stage": c.get("stage", "new"),
            "ai_match_score": c.get("ai_match_score"),
            "ai_analysis": c.get("ai_analysis"),
            "notes": c.get("notes"),
            "tags": c.get("tags", []),
            "metadata": c.get("metadata", {}),
        })

    if not rows:
        return []

    result = sb.table("candidates").insert(rows).execute()
    return result.data or []


# ── Automation Tasks ──────────────────────────────────────


def create_automation_task(
    tenant_id: str,
    created_by: str,
    task_type: str,
    name: str,
    config: dict,
    platform: Optional[str] = None,
    job_id: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> dict:
    """创建自动化任务记录"""
    sb = get_supabase(auth_token)
    result = sb.table("automation_tasks").insert({
        "tenant_id": tenant_id,
        "created_by": created_by,
        "type": task_type,
        "name": name,
        "status": "running",
        "config": config,
        "platform": platform,
        "job_id": job_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return result.data[0] if result.data else {}


def update_automation_task(
    task_id: str,
    updates: dict,
    auth_token: Optional[str] = None,
) -> dict:
    """更新自动化任务状态"""
    sb = get_supabase(auth_token)
    result = sb.table("automation_tasks").update(updates).eq("id", task_id).execute()
    return result.data[0] if result.data else {}


def complete_automation_task(
    task_id: str,
    status: str = "completed",
    result_summary: Optional[dict] = None,
    error_message: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> dict:
    """完成自动化任务"""
    updates: dict = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if result_summary is not None:
        updates["result_summary"] = result_summary
    if error_message is not None:
        updates["error_message"] = error_message
    return update_automation_task(task_id, updates, auth_token=auth_token)


# ── Task Logs ─────────────────────────────────────────────


def insert_task_log(
    task_id: str,
    tenant_id: str,
    level: str,
    message: str,
    metadata: Optional[dict] = None,
    auth_token: Optional[str] = None,
) -> None:
    """写入任务日志"""
    sb = get_supabase(auth_token)
    sb.table("task_logs").insert({
        "task_id": task_id,
        "tenant_id": tenant_id,
        "level": level,
        "message": message,
        "metadata": metadata,
    }).execute()
