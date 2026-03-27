"""
Supabase 客户端封装

负责向 Supabase 写入候选人、任务日志、自动化任务等数据，
以及将工作流截图上传到 Storage bucket。
"""

import logging
import re
import time
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional, TypedDict

import httpx
from supabase import create_client, Client

from config import get_settings

logger = logging.getLogger(__name__)

_anon_client: Optional[Client] = None
_service_client: Optional[Client] = None

SCREENSHOTS_BUCKET = "workflow-screenshots"


class ValidatedSupabaseUser(TypedDict):
    user_id: str
    tenant_id: str
    role: Optional[str]


class PlatformAccountRow(TypedDict, total=False):
    id: str
    tenant_id: str
    platform: str
    name: str
    account_name: Optional[str]
    platform_url: Optional[str]
    login_method: Optional[str]
    browser_session_key: Optional[str]
    login_state: Optional[str]
    login_identifier_masked: Optional[str]
    last_error: Optional[str]
    last_bind_task_id: Optional[str]
    last_unbind_task_id: Optional[str]
    encrypted_session_state: Optional[str]
    config: dict[str, Any]
    is_connected: bool
    status: str
    last_verified: Optional[str]
    last_login: Optional[str]
    created_at: str
    updated_at: str


class PlatformBindingSessionRow(TypedDict, total=False):
    id: str
    account_id: str
    tenant_id: str
    action: str
    status: str
    step_key: Optional[str]
    openclaw_session_key: str
    latest_screenshot_url: Optional[str]
    qr_screenshot_url: Optional[str]
    awaiting_payload_schema: Optional[dict[str, Any]]
    retry_count: int
    error_message: Optional[str]
    output_text: Optional[str]
    expires_at: Optional[str]
    created_at: str
    updated_at: str


class TenantSettingsRow(TypedDict, total=False):
    id: str
    tenant_id: str
    openclaw_gateway_url: str
    openclaw_auth_token: Optional[str]
    proxy_mode: bool
    ai_model: str
    ai_api_key: Optional[str]
    ai_validation_status: Optional[str]
    ai_validation_message: Optional[str]
    ai_validated_at: Optional[str]
    notification_wecom_url: Optional[str]
    notification_email: Optional[str]
    audit_logging: bool
    data_retention_days: int
    company_name: str
    company_address: str
    company_size: str
    company_overview: str
    created_at: str
    updated_at: str


class WorkflowRunRow(TypedDict, total=False):
    execution_id: str
    tenant_id: str
    workflow_id: str
    workflow_name: Optional[str]
    status: str
    multi_platform: bool
    request_payload: dict[str, Any]
    result_payload: Optional[dict[str, Any]]
    steps_payload: dict[str, Any]
    step_order: list[str]
    events_payload: list[dict[str, Any]]
    accumulated_output: str
    current_platform: Optional[dict[str, Any]]
    latest_checkpoint: Optional[dict[str, Any]]
    handoff_required: Optional[dict[str, Any]]
    error_message: Optional[str]
    error_code: Optional[str]
    task_id: Optional[str]
    created_at: str
    updated_at: str
    completed_at: Optional[str]


class WorkflowArtifactRow(TypedDict, total=False):
    artifact_id: str
    execution_id: str
    tenant_id: str
    step_id: str
    artifact_type: str
    source: str
    capture_phase: str
    mime_type: str
    storage_key: Optional[str]
    preview_url: Optional[str]
    live_url: Optional[str]
    signed_url: Optional[str]
    width: Optional[int]
    height: Optional[int]
    captured_at: str
    created_at: str
    updated_at: str


class WorkflowCheckpointRow(TypedDict, total=False):
    checkpoint_id: str
    execution_id: str
    tenant_id: str
    step_id: str
    step_name: Optional[str]
    step_index: int
    attempt: int
    artifact_ids: list[str]
    payload: dict[str, Any]
    verified_at: str
    created_at: str


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
    获取 service_role 级别的 Supabase 客户端。
    预留给未来系统任务/后台任务场景使用，当前工作流链路暂不启用。
    启用前应单独设计入口和权限边界，避免与用户态请求混用。
    """
    global _service_client
    settings = get_settings()
    if not settings.supabase_service_key:
        return None
    if _service_client is None:
        _service_client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _service_client


async def validate_supabase_user(
    auth_token: str,
    expected_user_id: Optional[str] = None,
    expected_tenant_id: Optional[str] = None,
) -> ValidatedSupabaseUser:
    """
    校验前端传来的 Supabase 用户 JWT，并返回后端确认过的用户身份。

    - auth.getUser: 校验 JWT 是否有效，并拿到真实 user_id
    - profiles: 读取租户信息，用于校验/覆盖前端透传 tenant_id
    """
    settings = get_settings()
    auth_url = settings.supabase_url.rstrip("/") + "/auth/v1/user"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                auth_url,
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "apikey": settings.supabase_anon_key,
                },
            )
            resp.raise_for_status()
    except Exception as exc:
        raise ValueError("Supabase 用户令牌无效或已过期") from exc

    user = resp.json() or {}
    user_id = user.get("id")
    if not user_id:
        raise ValueError("Supabase 用户令牌缺少用户标识")

    if expected_user_id and expected_user_id != user_id:
        raise PermissionError("请求中的 user_id 与当前登录用户不一致")

    profile_resp = (
        get_supabase(auth_token)
        .table("profiles")
        .select("tenant_id, role")
        .eq("id", user_id)
        .single()
        .execute()
    )
    profile = profile_resp.data or {}
    tenant_id = profile.get("tenant_id") or ""
    if not tenant_id:
        raise PermissionError("当前用户未绑定租户，禁止访问 Supabase 资源")

    if expected_tenant_id and expected_tenant_id != tenant_id:
        raise PermissionError("请求中的 tenant_id 与当前登录用户租户不一致")

    return {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "role": profile.get("role"),
    }


def mask_login_identifier(value: Optional[str]) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if raw.isdigit() and len(raw) >= 7:
        return f"{raw[:3]}****{raw[-4:]}"
    if len(raw) <= 2:
        return "*" * len(raw)
    if len(raw) <= 6:
        return raw[0] + "*" * (len(raw) - 2) + raw[-1]
    return raw[:2] + "*" * max(len(raw) - 4, 2) + raw[-2:]


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
      1. 传入了 auth_token（用户 JWT）→ 以认证用户身份上传（满足 RLS authenticated 策略）
      2. 当前不启用 service_role 兜底；未来如需支持系统任务，再单独开放
      3. 无用户 JWT → 返回 None，调用方回退到 base64

    存储路径: {execution_id}/{timestamp}_{filename}
    返回公开访问 URL，失败返回 None。
    """
    settings = get_settings()

    # 决定使用哪个 Bearer token
    if auth_token:
        bearer = auth_token
        logger.debug("使用用户 JWT 上传截图")
    else:
        # 预留：未来若有明确的系统任务入口，可在此显式启用 service_role 分支。
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


# ── Platform Accounts & Binding Sessions ───────────────────


def list_platform_accounts(
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> list[PlatformAccountRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_configs")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


def get_platform_account(
    account_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> Optional[PlatformAccountRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_configs")
        .select("*")
        .eq("id", account_id)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def create_platform_account(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> PlatformAccountRow:
    sb = get_supabase(auth_token)
    result = sb.table("platform_configs").insert(row).execute()
    return (result.data or [{}])[0]


def update_platform_account(
    account_id: str,
    tenant_id: str,
    patch: dict[str, Any],
    auth_token: Optional[str] = None,
) -> PlatformAccountRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_configs")
        .update(patch)
        .eq("id", account_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return (result.data or [{}])[0]


def delete_platform_account(
    account_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> bool:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_configs")
        .delete()
        .eq("id", account_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return len(result.data or []) > 0


def list_binding_sessions(
    tenant_id: str,
    account_id: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> list[PlatformBindingSessionRow]:
    sb = get_supabase(auth_token)
    query = (
        sb.table("platform_binding_sessions")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
    )
    if account_id:
        query = query.eq("account_id", account_id)
    result = query.execute()
    return result.data or []


def get_binding_session(
    session_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> Optional[PlatformBindingSessionRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_binding_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def create_binding_session(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> PlatformBindingSessionRow:
    sb = get_supabase(auth_token)
    result = sb.table("platform_binding_sessions").insert(row).execute()
    return (result.data or [{}])[0]


def update_binding_session(
    session_id: str,
    tenant_id: str,
    patch: dict[str, Any],
    auth_token: Optional[str] = None,
) -> PlatformBindingSessionRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_binding_sessions")
        .update(patch)
        .eq("id", session_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return (result.data or [{}])[0]


def attach_latest_binding_session(
    accounts: list[PlatformAccountRow],
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> list[dict[str, Any]]:
    if not accounts:
        return []

    sessions = list_binding_sessions(tenant_id, auth_token=auth_token)
    latest_by_account: dict[str, PlatformBindingSessionRow] = {}
    for session in sessions:
        account_id = session.get("account_id")
        if account_id and account_id not in latest_by_account:
            latest_by_account[account_id] = session

    enriched: list[dict[str, Any]] = []
    for account in accounts:
        item = deepcopy(account)
        item["latest_binding_session"] = latest_by_account.get(account.get("id", ""))
        enriched.append(item)
    return enriched


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
        "execution_id": execution_id,
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


# ── Workflow Runtime Persistence ──────────────────────────


def upsert_workflow_run(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> WorkflowRunRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_runs")
        .upsert(row, on_conflict="execution_id")
        .execute()
    )
    return (result.data or [{}])[0]


def get_workflow_run(
    execution_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> Optional[WorkflowRunRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_runs")
        .select("*")
        .eq("execution_id", execution_id)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def upsert_workflow_artifact(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> WorkflowArtifactRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_artifacts")
        .upsert(row, on_conflict="artifact_id")
        .execute()
    )
    return (result.data or [{}])[0]


def list_workflow_artifacts(
    execution_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> list[WorkflowArtifactRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_artifacts")
        .select("*")
        .eq("execution_id", execution_id)
        .eq("tenant_id", tenant_id)
        .order("captured_at", desc=False)
        .execute()
    )
    return result.data or []


def get_workflow_artifact(
    artifact_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> Optional[WorkflowArtifactRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_artifacts")
        .select("*")
        .eq("artifact_id", artifact_id)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def upsert_workflow_checkpoint(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> WorkflowCheckpointRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_checkpoints")
        .upsert(row, on_conflict="checkpoint_id")
        .execute()
    )
    return (result.data or [{}])[0]


def list_workflow_checkpoints(
    execution_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> list[WorkflowCheckpointRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_checkpoints")
        .select("*")
        .eq("execution_id", execution_id)
        .eq("tenant_id", tenant_id)
        .order("verified_at", desc=False)
        .execute()
    )
    return result.data or []
