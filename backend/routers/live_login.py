"""
noVNC 实时登录 API。

POST /api/live-login/start          启动 noVNC 登录会话
POST /api/live-login/{id}/confirm   确认登录完成
POST /api/live-login/{id}/stop      取消/停止会话
GET  /api/live-login/{id}/status    查询会话状态
"""

from __future__ import annotations

import base64
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


# ── 请求/响应模型 ────────────────────────────────────────────────

class StartRequest(BaseModel):
    account_id: str
    login_url: str | None = None


class StartResponse(BaseModel):
    session_id: str
    ws_port: int
    vnc_token: str
    ws_url: str
    login_url: str
    timeout_seconds: int


class ConfirmResponse(BaseModel):
    is_logged_in: bool
    message: str


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
    update_platform_account(body.account_id, tenant_id, {
        "status": "verifying",
        "login_state": "LIVE_SESSION_ACTIVE",
        "browser_session_key": browser_session_key,
    }, auth_token=auth_token)

    from services.live_login_service import SESSION_TIMEOUT
    ws_url = f"/novnc/{session.ws_port}/vnc.html?autoconnect=true&resize=scale&path=novnc/{session.ws_port}/websockify"
    return StartResponse(
        session_id=session.session_id,
        ws_port=session.ws_port,
        vnc_token=session.vnc_token,
        ws_url=ws_url,
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

    async def supabase_updater(account_id: str, encrypted: bytes, login_state: str):
        update_platform_account(account_id, tenant_id, {
            "encrypted_session_state": base64.b64encode(encrypted).decode(),
            "login_state": login_state,
            "status": "active",
            "is_connected": True,
        }, auth_token=auth_token)

    try:
        result = await confirm_login(session_id, supabase_updater=supabase_updater)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提取登录信息失败: {e}") from e

    if result["is_logged_in"]:
        return ConfirmResponse(
            is_logged_in=True,
            message="登录成功，会话已保存",
        )
    else:
        return ConfirmResponse(
            is_logged_in=False,
            message="未检测到有效登录态，请确认已完成登录后重试",
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
        update_platform_account(session.account_id, tenant_id, {
            "status": "needsLogin",
            "login_state": "NOT_BOUND",
        }, auth_token=auth_token)
    await stop_live_session(session_id)
    return {"status": "stopped"}


@router.get("/{session_id}/status", response_model=StatusResponse)
async def api_live_login_status(
    session_id: str,
    authorization: Optional[str] = Header(None),
):
    """查询 noVNC 会话状态。"""
    auth_token = _read_bearer(authorization)
    await _validate_request_user(auth_token)

    session = get_session(session_id)
    if not session:
        return StatusResponse(session_id=session_id, active=False)

    return StatusResponse(
        session_id=session_id,
        active=True,
        time_remaining=get_session_time_remaining(session_id),
        ws_port=session.ws_port,
        vnc_token=session.vnc_token,
    )
