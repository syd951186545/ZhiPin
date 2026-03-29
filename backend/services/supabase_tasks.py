"""
Supabase 租户设置 / 候选人 / 自动化任务 / 任务日志

提供：
  - get/update_tenant_settings
  - create_candidates_batch
  - create/update/complete_automation_task
  - insert_task_log
"""

from datetime import datetime, timezone
from typing import Any, Optional

from services.supabase_auth import get_supabase
from services.supabase_types import TenantSettingsRow


# ── Tenant Settings ────────────────────────────────────────


def get_tenant_settings(
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> Optional[TenantSettingsRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("tenant_settings")
        .select("*")
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def update_tenant_settings(
    tenant_id: str,
    patch: dict[str, Any],
    auth_token: Optional[str] = None,
) -> TenantSettingsRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("tenant_settings")
        .update(patch)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return (result.data or [{}])[0]


# ── Candidates ────────────────────────────────────────────


def create_candidates_batch(
    tenant_id: str,
    candidates: list[dict],
    auth_token: Optional[str] = None,
) -> list[dict]:
    """
    批量写入候选人记录（upsert，DB 层去重）。
    去重键：(tenant_id, source, name, job_id)

    每个 candidate dict 应包含:
        name, source, stage, job_id,
        ai_match_score?, ai_analysis?, email?, phone?, notes?, tags?, metadata?

    注意：phone/email 仅存储平台公开展示的信息（PIPL 合规）。
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

    result = (
        sb.table("candidates")
        .upsert(rows, on_conflict="tenant_id,source,name,job_id")
        .execute()
    )
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
    execution_id: Optional[str] = None,
    status: str = "running",
    started_at: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> dict:
    """创建自动化任务记录"""
    sb = get_supabase(auth_token)
    payload = {
        "tenant_id": tenant_id,
        "created_by": created_by,
        "type": task_type,
        "name": name,
        "status": status,
        "config": config,
        "platform": platform,
        "job_id": job_id,
        "execution_id": execution_id,
        "started_at": started_at if started_at is not None else (
            datetime.now(timezone.utc).isoformat() if status == "running" else None
        ),
    }
    result = sb.table("automation_tasks").insert(payload).execute()
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
    full_output: Optional[str] = None,
    screenshot_urls: Optional[list] = None,
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
    if full_output is not None:
        updates["full_output"] = full_output
    if screenshot_urls is not None:
        updates["screenshot_urls"] = screenshot_urls
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
