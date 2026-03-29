"""
平台账号与绑定会话 API。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from services.platform_binding_service import (
    get_binding_session_snapshot,
    is_binding_session_running,
    refresh_qr_session,
    start_unbind_session,
    start_verify_session,
    stream_binding_events,
)
from services.platform_catalog import get_platform_catalog_item
from services.platform_session_store import build_browser_session_key, clear_session_artifacts
from services.supabase_client import (
    attach_latest_binding_session,
    create_platform_account,
    delete_platform_account,
    get_binding_session,
    get_platform_account,
    list_binding_sessions,
    list_platform_accounts,
    update_binding_session,
    update_platform_account,
    validate_supabase_user,
)

router = APIRouter(tags=["platform-accounts"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _repair_orphaned_binding_session(
    item: dict[str, Any],
    tenant_id: str,
    auth_token: str,
) -> dict[str, Any]:
    latest_session = item.get("latest_binding_session") or {}
    session_id = str(latest_session.get("id") or "").strip()
    if latest_session.get("status") != "running" or not session_id:
        return item
    if is_binding_session_running(session_id):
        return item

    reason = "后端任务已中断，系统已自动修复状态，请按需重新发起验证"
    repaired_session = update_binding_session(
        session_id,
        tenant_id,
        {
            "status": "failed",
            "error_message": reason,
            "updated_at": _now_iso(),
        },
        auth_token=auth_token,
    )

    has_persisted_session = bool(item.get("encrypted_session_state"))
    if has_persisted_session:
        account_patch = {
            "status": "active",
            "is_connected": True,
            "login_state": "LOGGED_IN",
            "last_error": None,
        }
    else:
        account_patch = {
            "status": "needsLogin",
            "is_connected": False,
            "last_error": reason,
        }

    repaired_account = update_platform_account(
        item["id"],
        tenant_id,
        account_patch,
        auth_token=auth_token,
    )
    merged = {**item, **repaired_account}
    merged["latest_binding_session"] = repaired_session
    return merged


def _repair_interrupted_verify_session(
    *,
    account: dict[str, Any],
    binding_session: dict[str, Any],
    tenant_id: str,
    auth_token: str,
) -> dict[str, Any]:
    reason = "上一次验证任务已中断，系统已自动释放占用，可重新发起验证"
    repaired_session = update_binding_session(
        binding_session["id"],
        tenant_id,
        {
            "status": "failed",
            "error_message": reason,
            "updated_at": _now_iso(),
        },
        auth_token=auth_token,
    )

    if account.get("encrypted_session_state"):
        update_platform_account(
            account["id"],
            tenant_id,
            {
                "status": "active",
                "is_connected": True,
                "login_state": "LOGGED_IN",
                "last_error": None,
            },
            auth_token=auth_token,
        )
    else:
        update_platform_account(
            account["id"],
            tenant_id,
            {
                "status": "expired",
                "is_connected": False,
                "last_error": reason,
            },
            auth_token=auth_token,
        )
    return repaired_session


def _find_reusable_verify_session(
    *,
    account: dict[str, Any],
    tenant_id: str,
    auth_token: str,
) -> Optional[dict[str, Any]]:
    sessions = list_binding_sessions(tenant_id, account_id=account["id"], auth_token=auth_token)
    for session in sessions:
        if session.get("action") != "verify" or session.get("status") != "running":
            continue
        session_id = str(session.get("id") or "").strip()
        if not session_id:
            continue
        if is_binding_session_running(session_id):
            return session
        _repair_interrupted_verify_session(
            account=account,
            binding_session=session,
            tenant_id=tenant_id,
            auth_token=auth_token,
        )
        return None
    return None


def _read_bearer(authorization: Optional[str]) -> str:
    if not authorization:
        return ""
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip()


async def _validate_request_user(auth_token: str):
    if not auth_token:
        raise HTTPException(status_code=401, detail="缺少 Supabase 用户令牌")
    try:
        return await validate_supabase_user(auth_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


class PlatformAccountCreateRequest(BaseModel):
    platform: str
    name: str
    account_name: str = ""
    platform_url: str = ""
    supabase_auth_token: str = ""


class PlatformAccountActionRequest(BaseModel):
    supabase_auth_token: str = ""


@router.get("/api/platform-accounts")
async def get_platform_accounts(
    authorization: Optional[str] = Header(default=None),
):
    auth_token = _read_bearer(authorization)
    user = await _validate_request_user(auth_token)
    accounts = list_platform_accounts(user["tenant_id"], auth_token=auth_token)
    items = attach_latest_binding_session(accounts, user["tenant_id"], auth_token=auth_token)
    repaired_items = [
        _repair_orphaned_binding_session(item, user["tenant_id"], auth_token)
        for item in items
    ]
    return {"items": repaired_items}


@router.post("/api/platform-accounts")
async def create_platform_account_route(req: PlatformAccountCreateRequest):
    user = await _validate_request_user(req.supabase_auth_token)
    catalog_item = get_platform_catalog_item(req.platform)
    account = create_platform_account(
        {
            "tenant_id": user["tenant_id"],
            "platform": req.platform,
            "name": req.name.strip(),
            "account_name": req.account_name.strip() or None,
            "platform_url": req.platform_url.strip() or catalog_item["enterprise_url"],
            "login_method": catalog_item["recommended_login_method"],
            "browser_session_key": "",
            "login_state": "NOT_BOUND",
            "login_identifier_masked": None,
            "last_error": None,
            "last_bind_task_id": None,
            "last_unbind_task_id": None,
            "config": {
                "platform_name": catalog_item["name"],
                "supported_login_methods": catalog_item["supported_login_methods"],
            },
            "is_connected": False,
            "status": "needsLogin",
        },
        auth_token=req.supabase_auth_token,
    )
    browser_session_key = build_browser_session_key(user["tenant_id"], req.platform, account["id"])
    account = update_platform_account(
        account["id"],
        user["tenant_id"],
        {"browser_session_key": browser_session_key},
        auth_token=req.supabase_auth_token,
    )
    return {"item": account}


@router.get("/api/platform-binding-sessions/{session_id}")
async def get_binding_session_route(
    session_id: str,
    authorization: Optional[str] = Header(default=None),
):
    auth_token = _read_bearer(authorization)
    user = await _validate_request_user(auth_token)
    session = get_binding_session_snapshot(session_id, user["tenant_id"], auth_token=auth_token)
    if not session:
        raise HTTPException(status_code=404, detail="绑定会话不存在")
    return {"item": session}


@router.post("/api/platform-binding-sessions/{session_id}/refresh-qr")
async def refresh_qr_route(session_id: str, req: PlatformAccountActionRequest):
    user = await _validate_request_user(req.supabase_auth_token)
    binding_session = get_binding_session(session_id, user["tenant_id"], auth_token=req.supabase_auth_token)
    if not binding_session:
        raise HTTPException(status_code=404, detail="绑定会话不存在")
    if binding_session.get("status") != "awaiting_qr":
        raise HTTPException(status_code=400, detail="当前会话状态不支持刷新二维码")
    account = get_platform_account(binding_session["account_id"], user["tenant_id"], auth_token=req.supabase_auth_token)
    if not account:
        raise HTTPException(status_code=404, detail="平台账号不存在")
    new_url = await refresh_qr_session(
        binding_session=binding_session,
        account=account,
        tenant_id=user["tenant_id"],
        auth_token=req.supabase_auth_token,
    )
    return {"qr_screenshot_url": new_url}


@router.get("/api/platform-binding-sessions/{session_id}/stream")
async def stream_binding_session(
    session_id: str,
    token: Optional[str] = None,
):
    # EventSource 不支持自定义 header，通过 query param 传递 token 鉴权
    if not token:
        raise HTTPException(status_code=401, detail="缺少认证 token，请通过 ?token= 传递")
    try:
        user = await _validate_request_user(token)
        session = get_binding_session(session_id, user["tenant_id"], auth_token=token)
        if not session:
            raise HTTPException(status_code=404, detail="绑定会话不存在或无权访问")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="认证失败")
    return EventSourceResponse(stream_binding_events(session_id))


@router.post("/api/platform-accounts/{account_id}/verify")
async def verify_platform_account(account_id: str, req: PlatformAccountActionRequest):
    user = await _validate_request_user(req.supabase_auth_token)
    account = get_platform_account(account_id, user["tenant_id"], auth_token=req.supabase_auth_token)
    if not account:
        raise HTTPException(status_code=404, detail="平台账号不存在")
    reusable_session = _find_reusable_verify_session(
        account=account,
        tenant_id=user["tenant_id"],
        auth_token=req.supabase_auth_token,
    )
    if reusable_session:
        return {"item": reusable_session, "reused_existing": True}
    session = start_verify_session(account=account, tenant_id=user["tenant_id"], auth_token=req.supabase_auth_token)
    return {"item": session, "reused_existing": False}


@router.delete("/api/platform-accounts/{account_id}")
async def delete_platform_account_route(
    account_id: str,
    authorization: Optional[str] = Header(default=None),
):
    auth_token = _read_bearer(authorization)
    user = await _validate_request_user(auth_token)
    account = get_platform_account(account_id, user["tenant_id"], auth_token=auth_token)
    if not account:
        raise HTTPException(status_code=404, detail="平台账号不存在")
    browser_session_key = account.get("browser_session_key") or ""
    if browser_session_key:
        clear_session_artifacts(browser_session_key)
    delete_platform_account(account_id, user["tenant_id"], auth_token=auth_token)
    return {"success": True}


@router.post("/api/platform-accounts/{account_id}/unbind")
async def unbind_platform_account(account_id: str, req: PlatformAccountActionRequest):
    user = await _validate_request_user(req.supabase_auth_token)
    account = get_platform_account(account_id, user["tenant_id"], auth_token=req.supabase_auth_token)
    if not account:
        raise HTTPException(status_code=404, detail="平台账号不存在")
    session = start_unbind_session(account=account, tenant_id=user["tenant_id"], auth_token=req.supabase_auth_token)
    return {"item": session}
