"""
平台账号与绑定会话 API。
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from services.platform_binding_service import (
    get_binding_session_snapshot,
    start_bind_session,
    start_unbind_session,
    start_verify_session,
    stream_binding_events,
    submit_bind_session,
)
from services.platform_catalog import get_platform_catalog_item
from services.platform_session_store import build_browser_session_key
from services.supabase_client import (
    attach_latest_binding_session,
    create_platform_account,
    get_binding_session,
    get_platform_account,
    list_platform_accounts,
    update_platform_account,
    validate_supabase_user,
)

router = APIRouter(tags=["platform-accounts"])


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


class PlatformBindStartRequest(BaseModel):
    login_method: str
    phone: str = ""
    login_name: str = ""
    password: str = ""
    supabase_auth_token: str = ""


class PlatformBindingSubmitRequest(BaseModel):
    verification_code: str = ""
    secondary_code: str = ""
    password: str = ""
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
    return {"items": attach_latest_binding_session(accounts, user["tenant_id"], auth_token=auth_token)}


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


@router.post("/api/platform-accounts/{account_id}/bind/start")
async def start_account_bind(account_id: str, req: PlatformBindStartRequest):
    user = await _validate_request_user(req.supabase_auth_token)
    account = get_platform_account(account_id, user["tenant_id"], auth_token=req.supabase_auth_token)
    if not account:
        raise HTTPException(status_code=404, detail="平台账号不存在")

    session = start_bind_session(
        account=account,
        tenant_id=user["tenant_id"],
        auth_token=req.supabase_auth_token,
        payload=req.model_dump(exclude={"supabase_auth_token"}),
    )
    return {"item": session}


@router.post("/api/platform-binding-sessions/{session_id}/submit")
async def submit_account_bind(session_id: str, req: PlatformBindingSubmitRequest):
    user = await _validate_request_user(req.supabase_auth_token)
    binding_session = get_binding_session(session_id, user["tenant_id"], auth_token=req.supabase_auth_token)
    if not binding_session:
        raise HTTPException(status_code=404, detail="绑定会话不存在")

    account = get_platform_account(binding_session["account_id"], user["tenant_id"], auth_token=req.supabase_auth_token)
    if not account:
        raise HTTPException(status_code=404, detail="平台账号不存在")

    new_session = submit_bind_session(
        account=account,
        binding_session=binding_session,
        tenant_id=user["tenant_id"],
        auth_token=req.supabase_auth_token,
        payload=req.model_dump(exclude={"supabase_auth_token"}),
    )
    return {"item": new_session}


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


@router.get("/api/platform-binding-sessions/{session_id}/stream")
async def stream_binding_session(session_id: str):
    return EventSourceResponse(stream_binding_events(session_id))


@router.post("/api/platform-accounts/{account_id}/verify")
async def verify_platform_account(account_id: str, req: PlatformAccountActionRequest):
    user = await _validate_request_user(req.supabase_auth_token)
    account = get_platform_account(account_id, user["tenant_id"], auth_token=req.supabase_auth_token)
    if not account:
        raise HTTPException(status_code=404, detail="平台账号不存在")
    session = start_verify_session(account=account, tenant_id=user["tenant_id"], auth_token=req.supabase_auth_token)
    return {"item": session}


@router.post("/api/platform-accounts/{account_id}/unbind")
async def unbind_platform_account(account_id: str, req: PlatformAccountActionRequest):
    user = await _validate_request_user(req.supabase_auth_token)
    account = get_platform_account(account_id, user["tenant_id"], auth_token=req.supabase_auth_token)
    if not account:
        raise HTTPException(status_code=404, detail="平台账号不存在")
    session = start_unbind_session(account=account, tenant_id=user["tenant_id"], auth_token=req.supabase_auth_token)
    return {"item": session}
