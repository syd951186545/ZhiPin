"""
noVNC 实时登录 API。

POST /api/live-login/start          启动 noVNC 登录会话
POST /api/live-login/{id}/confirm   确认登录完成
POST /api/live-login/{id}/stop      取消/停止会话
GET  /api/live-login/{id}/status    查询会话状态
"""

from __future__ import annotations

import base64
import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from services.live_login_service import (
    LiveSession,
    confirm_login,
    get_session,
    get_session_time_remaining,
    start_live_session,
    stop_live_session,
)
from services.platform_session_store import build_browser_session_key
from services.supabase_client import (
    get_platform_account,
    update_platform_account,
    validate_supabase_user,
)

router = APIRouter(prefix="/api/live-login", tags=["live-login"])
logger = logging.getLogger(__name__)


# ── 请求/响应模型 ────────────────────────────────────────────────

class StartRequest(BaseModel):
    account_id: str
    login_url: str | None = None


class StartResponse(BaseModel):
    session_id: str
    ws_port: int
    vnc_token: str
    login_url: str
    timeout_seconds: int


class ConfirmResponse(BaseModel):
    success: bool
    is_logged_in: bool
    message: str
    workspace_saved: bool = False
    db_saved: bool = False
    persistence_detail: str = ""


class StatusResponse(BaseModel):
    session_id: str
    active: bool
    time_remaining: float | None = None
    ws_port: int | None = None
    vnc_token: str | None = None


# ── 辅助 ─────────────────────────────────────────────────────────

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


# ── 路由 ─────────────────────────────────────────────────────────

@router.post("/start", response_model=StartResponse)
async def api_start_live_login(
    body: StartRequest,
    authorization: Optional[str] = Header(None),
):
    """启动 noVNC 实时登录会话。"""
    auth_token = _read_bearer(authorization)
    user_info = await _validate_request_user(auth_token)
    tenant_id = user_info["tenant_id"]

    account = get_platform_account(body.account_id, tenant_id, auth_token=auth_token)
    if not account:
        raise HTTPException(status_code=404, detail="平台账号不存在")

    browser_session_key = account.get("browser_session_key") or build_browser_session_key(
        tenant_id, account["platform"], body.account_id,
    )

    try:
        session = await start_live_session(
            account_id=body.account_id,
            tenant_id=tenant_id,
            platform=account["platform"],
            browser_session_key=browser_session_key,
            login_url=body.login_url,
        )
    except RuntimeError as e:
        status = 429 if "通道已满" in str(e) else 409
        raise HTTPException(status_code=status, detail=str(e)) from e

    # 更新账号状态
    update_platform_account(
        body.account_id,
        tenant_id,
        {
            "status": "verifying",
            "login_state": "LIVE_SESSION_ACTIVE",
            "browser_session_key": browser_session_key,
        },
        auth_token=auth_token,
    )

    from services.live_login_service import SESSION_TIMEOUT
    return StartResponse(
        session_id=session.session_id,
        ws_port=session.ws_port,
        vnc_token=session.vnc_token,
        login_url=session.login_url,
        timeout_seconds=SESSION_TIMEOUT,
    )


@router.post("/{session_id}/confirm", response_model=ConfirmResponse)
async def api_confirm_live_login(
    session_id: str,
    authorization: Optional[str] = Header(None),
):
    """用户确认登录完成，提取并持久化 cookies。"""
    auth_token = _read_bearer(authorization)
    user_info = await _validate_request_user(auth_token)
    tenant_id = user_info["tenant_id"]

    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或已关闭")
    if session.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="无权访问该登录会话")

    async def supabase_updater(account_id: str, encrypted: bytes, login_state: str):
        encoded = base64.b64encode(encrypted).decode()
        update_platform_account(
            account_id,
            tenant_id,
            {
                "encrypted_session_state": encoded,
                "login_state": login_state,
                "status": "active",
                "is_connected": True,
            },
            auth_token=auth_token,
        )
        saved_row = get_platform_account(account_id, tenant_id, auth_token=auth_token) or {}
        db_saved = (
            bool(saved_row.get("encrypted_session_state"))
            and saved_row.get("login_state") == "LOGGED_IN"
            and saved_row.get("status") == "active"
        )
        detail = (
            "数据库字段已回读确认"
            if db_saved
            else "数据库回读失败：encrypted_session_state/login_state/status 未全部生效"
        )
        if not db_saved:
            logger.warning("live_login DB 持久化校验失败: account_id=%s", account_id)
        return {"saved": db_saved, "detail": detail}

    try:
        result = await confirm_login(session_id, supabase_updater=supabase_updater)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提取登录信息失败: {e}") from e

    workspace_saved = bool(result.get("persistence", {}).get("workspace_saved", False))
    db_saved = bool(result.get("persistence", {}).get("db_saved", False))
    persistence_detail = " | ".join(
        part for part in [
            str(result.get("persistence", {}).get("workspace_detail", "")).strip(),
            str(result.get("persistence", {}).get("db_detail", "")).strip(),
        ] if part
    )

    if result["is_logged_in"] and workspace_saved and db_saved:
        return ConfirmResponse(
            success=True,
            is_logged_in=True,
            message="登录成功，会话已保存",
            workspace_saved=True,
            db_saved=True,
            persistence_detail=persistence_detail,
        )
    else:
        return ConfirmResponse(
            success=False,
            is_logged_in=False,
            message="登录态未通过持久化校验，请确认登录后重试",
            workspace_saved=workspace_saved,
            db_saved=db_saved,
            persistence_detail=persistence_detail,
        )


@router.post("/{session_id}/stop")
async def api_stop_live_login(
    session_id: str,
    authorization: Optional[str] = Header(None),
):
    """取消/停止 noVNC 会话。"""
    auth_token = _read_bearer(authorization)
    user_info = await _validate_request_user(auth_token)
    tenant_id = user_info["tenant_id"]

    session = get_session(session_id)
    if session:
        if session.tenant_id != tenant_id:
            raise HTTPException(status_code=403, detail="无权访问该登录会话")
        update_platform_account(
            session.account_id,
            tenant_id,
            {
                "status": "needsLogin",
                "login_state": "NOT_BOUND",
            },
            auth_token=auth_token,
        )
    await stop_live_session(session_id)
    return {"status": "stopped"}


@router.get("/{session_id}/status", response_model=StatusResponse)
async def api_live_login_status(
    session_id: str,
    authorization: Optional[str] = Header(None),
):
    """查询 noVNC 会话状态。"""
    auth_token = _read_bearer(authorization)
    user_info = await _validate_request_user(auth_token)
    tenant_id = user_info["tenant_id"]

    session = get_session(session_id)
    if not session:
        return StatusResponse(session_id=session_id, active=False)
    if session.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="无权访问该登录会话")

    return StatusResponse(
        session_id=session_id,
        active=True,
        time_remaining=get_session_time_remaining(session_id),
        ws_port=session.ws_port,
        vnc_token=session.vnc_token,
    )
