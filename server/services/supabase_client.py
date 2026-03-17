"""
Supabase 客户端封装

负责向 Supabase 写入候选人、任务日志、自动化任务等数据。
"""

from datetime import datetime, timezone
from typing import Optional
from supabase import create_client, Client

from config import get_settings


_anon_client: Optional[Client] = None


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
