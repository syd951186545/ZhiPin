"""
平台账号绑定/验证/解绑异步执行服务。
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Optional
from uuid import uuid4

from parsers.platform_binding_parser import parse_platform_binding_output
from prompts.platform_binding import (
    build_correction_prompt,
    build_unbind_prompt,
    build_verify_prompt,
)
from services.openclaw_client import OpenClawClient, StepResult
from services.platform_session_store import (
    clear_session_artifacts,
    release_browser_mutex,
    rotate_browser_session_key,
    try_acquire_browser_mutex,
    write_session_metadata,
)
from services.supabase_client import (
    PlatformAccountRow,
    PlatformBindingSessionRow,
    create_binding_session,
    get_binding_session,
    make_screenshot_uploader,
    update_binding_session,
    update_platform_account,
)

logger = logging.getLogger(__name__)

_event_queues: dict[str, asyncio.Queue] = {}
_event_history: dict[str, list[dict[str, Any]]] = {}
_running_tasks: dict[str, asyncio.Task] = {}
_completed_sessions: set[str] = set()
OPENCLAW_ACTION_TIMEOUT_SECONDS = 40.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _future_iso(minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def is_binding_session_running(session_id: str) -> bool:
    task = _running_tasks.get(session_id)
    return bool(task and not task.done())


async def emit_binding_event(session_id: str, event_type: str, data: dict[str, Any]) -> None:
    payload = {"event": event_type, "data": data}
    _event_history.setdefault(session_id, []).append(payload)
    queue = _event_queues.setdefault(session_id, asyncio.Queue())
    await queue.put(payload)


async def stream_binding_events(session_id: str) -> AsyncIterator[dict[str, str]]:
    history = _event_history.get(session_id, [])
    seen_ids = {id(item) for item in history}
    for item in history:
        yield {"event": item["event"], "data": json.dumps(item["data"], ensure_ascii=False)}

    if session_id in _completed_sessions:
        return

    queue = _event_queues.setdefault(session_id, asyncio.Queue())
    while True:
        event = await queue.get()
        if event is None:
            break
        if id(event) in seen_ids:
            continue
        seen_ids.add(id(event))
        yield {"event": event["event"], "data": json.dumps(event["data"], ensure_ascii=False)}


def _close_binding_stream(session_id: str) -> None:
    _completed_sessions.add(session_id)
    queue = _event_queues.setdefault(session_id, asyncio.Queue())
    try:
        queue.put_nowait(None)
    except Exception:
        pass
    # 延迟清理事件历史，避免内存持续积累（保留 60 秒供迟到的订阅者回放）
    async def _delayed_cleanup() -> None:
        await asyncio.sleep(60)
        _event_history.pop(session_id, None)
        _event_queues.pop(session_id, None)
        _completed_sessions.discard(session_id)

    try:
        asyncio.get_event_loop().create_task(_delayed_cleanup())
    except RuntimeError:
        pass


def _awaiting_schema(status: str) -> Optional[dict[str, Any]]:
    if status == "awaiting_sms":
        return {
            "fields": [
                {"key": "verification_code", "label": "短信验证码", "type": "text", "required": True},
            ]
        }
    if status == "awaiting_password_2fa":
        return {
            "fields": [
                {"key": "secondary_code", "label": "二次验证码", "type": "text", "required": False},
                {"key": "password", "label": "二次验证密码", "type": "password", "required": False},
            ]
        }
    return None


def _normalize_status(action: str, parsed_state: str, reason: str) -> str:
    if action == "unbind":
        # 只有明确退出登录才视为完成，其余（含 FAILED）上报真实失败
        if parsed_state in {"LOGGED_OUT", "NOT_BOUND"}:
            return "completed"
        return "failed"
    return {
        "LOGGED_IN": "completed",
        "AWAIT_SMS": "awaiting_sms",
        "AWAIT_QR": "awaiting_qr",
        "AWAIT_PASSWORD_2FA": "awaiting_password_2fa",
        "FAILED": "failed",
        "LOGGED_OUT": "completed",
    }.get(parsed_state, "failed")


def _account_patch_for_status(
    account: PlatformAccountRow,
    action: str,
    status: str,
    reason: str,
    session_id: str,
    parsed_state: str,
    identifier_masked: Optional[str],
    account_name: Optional[str],
) -> dict[str, Any]:
    patch: dict[str, Any] = {
        "login_state": parsed_state,
        "last_error": reason or None,
    }
    if identifier_masked:
        patch["login_identifier_masked"] = identifier_masked
    if account_name:
        patch["account_name"] = account_name

    if action == "bind":
        patch["last_bind_task_id"] = session_id
        if status == "completed":
            patch.update(
                {
                    "status": "active",
                    "is_connected": True,
                    "last_login": _now_iso(),
                    "last_verified": _now_iso(),
                    "last_error": None,
                }
            )
        elif status.startswith("awaiting_"):
            patch.update({"status": "verifying", "is_connected": False})
        else:
            patch.update({"status": "needsLogin", "is_connected": False})
    elif action == "verify":
        if status == "completed":
            patch.update(
                {
                    "status": "active",
                    "is_connected": True,
                    "last_verified": _now_iso(),
                    "last_error": None,
                }
            )
        else:
            patch.update({"status": "expired", "is_connected": False})
    elif action == "unbind":
        patch.update(
            {
                "status": "needsLogin",
                "is_connected": False,
                "last_unbind_task_id": session_id,
                "login_state": "NOT_BOUND",
            }
        )
    return patch


def _session_patch_for_status(
    action: str,
    status: str,
    reason: str,
    parsed_state: str,
    step_key: str,
    screenshot: Optional[str],
    output_text: Optional[str] = None,
) -> dict[str, Any]:
    patch: dict[str, Any] = {
        "status": status,
        "step_key": step_key,
        "error_message": reason or None,
        "output_text": output_text or None,
        "latest_screenshot_url": screenshot,
        "updated_at": _now_iso(),
        "awaiting_payload_schema": _awaiting_schema(status),
        "expires_at": _future_iso(10) if status.startswith("awaiting_") else None,
    }
    if status == "awaiting_qr":
        patch["qr_screenshot_url"] = screenshot
    elif action == "bind" and status == "completed":
        patch["qr_screenshot_url"] = None
    return patch


async def _execute_openclaw_with_retries(
    session_id: str,
    account: PlatformAccountRow,
    prompt: str,
    auth_token: Optional[str],
) -> tuple[StepResult, Optional[dict[str, Any]]]:
    openclaw = OpenClawClient()
    uploader = make_screenshot_uploader(session_id, auth_token)
    session_key = account.get("browser_session_key") or ""
    latest_screenshot: Optional[str] = None

    async def on_progress(delta: str, accumulated: str, screenshots: list[str]) -> None:
        await emit_binding_event(
            session_id,
            "progress",
            {
                "delta": delta,
                "accumulated_text": accumulated,
                "screenshots": screenshots,
                "latest_screenshot": latest_screenshot,
            },
        )

    async def on_screenshot(screenshot: str) -> None:
        nonlocal latest_screenshot
        latest_screenshot = screenshot
        await emit_binding_event(
            session_id,
            "progress",
            {
                "delta": "",
                "accumulated_text": last_result.accumulated_text if last_result else "",
                "screenshots": [],
                "latest_screenshot": latest_screenshot,
            },
        )

    current_prompt = prompt
    last_result: Optional[StepResult] = None
    last_parsed: Optional[dict[str, Any]] = None

    for attempt in range(1, 4):
        if attempt > 1:
            last_error = (last_result.error if last_result else None) or ""
            last_state = (last_parsed.get("state") if last_parsed else None) or ""
            current_prompt = build_correction_prompt(
                original_prompt=prompt,
                attempt=attempt,
                last_error=last_error,
                last_state=last_state,
                browser_profile=session_key,
            )
            await emit_binding_event(
                session_id,
                "state",
                {"status": "running", "message": f"第 {attempt} 次尝试纠偏执行", "attempt": attempt},
            )

        try:
            result = await asyncio.wait_for(
                openclaw.execute_step(
                    prompt=current_prompt,
                    session_id=session_key,
                    step_id=f"binding_{attempt}",
                    on_progress=on_progress,
                    on_screenshot=on_screenshot,
                    screenshot_uploader=uploader,
                ),
                timeout=OPENCLAW_ACTION_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            result = StepResult(
                success=False,
                accumulated_text="",
                screenshots=[],
                error=f"OpenClaw 执行超时（>{int(OPENCLAW_ACTION_TIMEOUT_SECONDS)}秒），已自动终止",
            )
        last_result = result
        accumulated_text = result.accumulated_text or ""
        parsed = parse_platform_binding_output(accumulated_text)
        last_parsed = (
            {
                "state": parsed.state,
                "step_key": parsed.step_key,
                "reason": parsed.reason,
                "identifier_masked": parsed.identifier_masked,
                "account_name": parsed.account_name,
            }
            if parsed
            else None
        )

        if parsed:
            return result, last_parsed

        if result.error and attempt >= 3:
            break

    return (
        last_result
        or StepResult(success=False, accumulated_text="", screenshots=[], error="OpenClaw 未返回结果"),
        last_parsed,
    )


async def _run_action(
    *,
    binding_session: PlatformBindingSessionRow,
    account: PlatformAccountRow,
    action: str,
    prompt: str,
    tenant_id: str,
    auth_token: Optional[str],
) -> None:
    session_id = binding_session["id"]
    browser_session_key = account.get("browser_session_key") or ""
    label = f"{action}:{account.get('platform')}:{account.get('id')}"

    if not try_acquire_browser_mutex(browser_session_key, label):
        await emit_binding_event(session_id, "error", {"message": "浏览器正在被其他任务使用，请稍后重试"})
        update_binding_session(
            session_id,
            tenant_id,
            {"status": "failed", "error_message": "浏览器正在被其他任务使用"},
            auth_token=auth_token,
        )
        _close_binding_stream(session_id)
        return

    try:
        write_session_metadata(browser_session_key, {"account_id": account.get("id"), "action": action})
        await emit_binding_event(
            session_id,
            "meta",
            {
                "session_id": session_id,
                "action": action,
                "account_id": account.get("id"),
                "browser_session_key": browser_session_key,
            },
        )

        result, parsed = await _execute_openclaw_with_retries(session_id, account, prompt, auth_token)
        screenshots = result.screenshots or []
        persisted_screenshots = list(result.persisted_screenshots or [])
        if result.pending_uploads:
            upload_results = await asyncio.gather(*result.pending_uploads, return_exceptions=True)
            for item in upload_results:
                if isinstance(item, str) and item and item not in persisted_screenshots:
                    persisted_screenshots.append(item)
        latest_screenshot = (
            persisted_screenshots[-1]
            if persisted_screenshots
            else binding_session.get("latest_screenshot_url")
        )

        if not parsed:
            reason = result.error or "OpenClaw 未按协议输出结构化状态"
            parsed = {
                "state": "FAILED",
                "step_key": "PARSE_FAILED",
                "reason": reason,
                "identifier_masked": None,
            }

        status = _normalize_status(action, parsed["state"], parsed["reason"])
        session_patch = _session_patch_for_status(
            action,
            status,
            parsed["reason"],
            parsed["state"],
            parsed["step_key"],
            latest_screenshot,
            result.accumulated_text or "",
        )
        update_binding_session(session_id, tenant_id, session_patch, auth_token=auth_token)

        account_patch = _account_patch_for_status(
            account,
            action,
            status,
            parsed["reason"],
            session_id,
            parsed["state"],
            parsed.get("identifier_masked"),
            parsed.get("account_name"),
        )

        if action == "unbind":
            clear_session_artifacts(browser_session_key)
            account_patch["browser_session_key"] = rotate_browser_session_key(
                browser_session_key,
                tenant_id=tenant_id,
                platform=account.get("platform", ""),
                account_id=account.get("id", ""),
            )

        update_platform_account(account["id"], tenant_id, account_patch, auth_token=auth_token)

        await emit_binding_event(
            session_id,
            "state",
            {
                "status": status,
                "step_key": parsed["step_key"],
                "reason": parsed["reason"],
                "identifier_masked": parsed.get("identifier_masked"),
                "account_name": parsed.get("account_name"),
                "latest_screenshot": latest_screenshot,
                "screenshots": screenshots,
                "accumulated_text": result.accumulated_text or "",
            },
        )

        if status in {"completed", "failed"}:
            event_name = "complete" if status == "completed" else "error"
            await emit_binding_event(
                session_id,
                event_name,
                {
                    "status": status,
                    "reason": parsed["reason"],
                    "latest_screenshot": latest_screenshot,
                    "accumulated_text": result.accumulated_text or "",
                },
            )
    except Exception as exc:
        logger.exception("平台账号工作流执行失败: %s", session_id)
        update_binding_session(
            session_id,
            tenant_id,
            {
                "status": "failed",
                "error_message": str(exc),
                "updated_at": _now_iso(),
            },
            auth_token=auth_token,
        )
        update_platform_account(
            account["id"],
            tenant_id,
            {"status": "needsLogin", "is_connected": False, "last_error": str(exc)},
            auth_token=auth_token,
        )
        await emit_binding_event(session_id, "error", {"message": str(exc)})
    finally:
        release_browser_mutex(browser_session_key)
        _running_tasks.pop(session_id, None)
        _close_binding_stream(session_id)


def create_action_session(
    *,
    account: PlatformAccountRow,
    tenant_id: str,
    action: str,
    auth_token: Optional[str],
    prompt: str,
) -> PlatformBindingSessionRow:
    session_row = create_binding_session(
        {
            "id": str(uuid4()),
            "account_id": account["id"],
            "tenant_id": tenant_id,
            "action": action,
            "status": "running",
            "step_key": "INIT",
            "openclaw_session_key": account.get("browser_session_key"),
            "latest_screenshot_url": None,
            "qr_screenshot_url": None,
            "awaiting_payload_schema": None,
            "retry_count": 0,
            "error_message": None,
            "output_text": None,
            "expires_at": None,
        },
        auth_token=auth_token,
    )
    _event_history[session_row["id"]] = []
    _event_queues[session_row["id"]] = asyncio.Queue()
    task = asyncio.create_task(
        _run_action(
            binding_session=session_row,
            account=account,
            action=action,
            prompt=prompt,
            tenant_id=tenant_id,
            auth_token=auth_token,
        )
    )
    _running_tasks[session_row["id"]] = task
    return session_row


async def ensure_verify_session_ready(
    *,
    account: PlatformAccountRow,
) -> dict[str, Any]:
    session_key = str(account.get("browser_session_key") or "").strip()
    client = OpenClawClient()
    result = await client.ensure_host_browser_ready(
        session_id=session_key,
        platform_url=str(account.get("platform_url") or "").strip(),
        encrypted_session_state=str(account.get("encrypted_session_state") or "").strip(),
    )
    return {
        "ready": result.ready,
        "detail": result.detail,
        "http_status": result.http_status,
        "status_snapshot": result.status_snapshot,
    }


def start_verify_session(
    *,
    account: PlatformAccountRow,
    tenant_id: str,
    auth_token: Optional[str],
) -> PlatformBindingSessionRow:
    update_platform_account(
        account["id"],
        tenant_id,
        {"status": "verifying", "last_error": None},
        auth_token=auth_token,
    )
    return create_action_session(
        account=account,
        tenant_id=tenant_id,
        action="verify",
        auth_token=auth_token,
        prompt=build_verify_prompt(account),
    )


def start_unbind_session(
    *,
    account: PlatformAccountRow,
    tenant_id: str,
    auth_token: Optional[str],
) -> PlatformBindingSessionRow:
    return create_action_session(
        account=account,
        tenant_id=tenant_id,
        action="unbind",
        auth_token=auth_token,
        prompt=build_unbind_prompt(account),
    )


async def refresh_qr_session(
    *,
    binding_session: PlatformBindingSessionRow,
    account: PlatformAccountRow,
    tenant_id: str,
    auth_token: Optional[str],
) -> Optional[str]:
    """刷新二维码截图。返回新的 qr_screenshot_url 或 None。"""
    session_id = binding_session["id"]
    browser_session_key = account.get("browser_session_key") or ""

    if not try_acquire_browser_mutex(browser_session_key, f"refresh_qr:{account.get('id')}"):
        return None

    try:
        openclaw = OpenClawClient()
        uploader = make_screenshot_uploader(session_id, auth_token)
        from config import get_settings
        media_mount = get_settings().openclaw_media_mount.rstrip("/")
        result = await openclaw.execute_step(
            prompt=(
                "当前二维码可能已过期。请刷新页面或点击二维码区域的刷新按钮，等待新的二维码出现。"
                "然后使用浏览器内置截图能力截取二维码截图。"
                "优先直接返回截图工具产生的 image_url 或 markdown 图片链接，不要输出本地文件路径。"
                f"如果截图工具只能提供文件路径，截图必须位于稳定媒体目录 {media_mount}/browser/ 下，"
                "禁止输出 /tmp 或 /home 等本地绝对路径。"
            ),
            session_id=browser_session_key,
            step_id="refresh_qr",
            screenshot_uploader=uploader,
        )
        persisted = list(result.persisted_screenshots or [])
        if result.pending_uploads:
            upload_results = await asyncio.gather(*result.pending_uploads, return_exceptions=True)
            for item in upload_results:
                if isinstance(item, str) and item and item not in persisted:
                    persisted.append(item)
        new_screenshot = persisted[-1] if persisted else None
        if new_screenshot:
            update_binding_session(
                session_id,
                tenant_id,
                {
                    "qr_screenshot_url": new_screenshot,
                    "latest_screenshot_url": new_screenshot,
                    "updated_at": _now_iso(),
                    "expires_at": _future_iso(10),
                },
                auth_token=auth_token,
            )
            await emit_binding_event(
                session_id,
                "state",
                {
                    "status": "awaiting_qr",
                    "reason": "二维码已刷新，请重新扫码",
                    "latest_screenshot": new_screenshot,
                    "qr_screenshot_url": new_screenshot,
                },
            )
        return new_screenshot
    finally:
        release_browser_mutex(browser_session_key)


def get_binding_session_snapshot(
    session_id: str,
    tenant_id: str,
    auth_token: Optional[str],
) -> Optional[PlatformBindingSessionRow]:
    return get_binding_session(session_id, tenant_id, auth_token=auth_token)


def cleanup_orphaned_running_sessions() -> None:
    """启动时清理孤儿 running 会话（进程重启后 in-memory task 丢失，DB 仍为 running）。"""
    from services.supabase_client import get_service_supabase, get_supabase

    try:
        sb = get_service_supabase() or get_supabase(None)
        result = (
            sb.table("platform_binding_sessions")
            .select("id, account_id, tenant_id")
            .eq("status", "running")
            .execute()
        )
        for row in result.data or []:
            sid = row["id"]
            tid = row["tenant_id"]
            aid = row["account_id"]
            sb.table("platform_binding_sessions").update({
                "status": "failed",
                "error_message": "后端重启，任务已中断，请重新发起绑定",
                "updated_at": _now_iso(),
            }).eq("id", sid).eq("tenant_id", tid).execute()
            sb.table("platform_configs").update({
                "status": "needsLogin",
                "is_connected": False,
                "last_error": "后端重启，绑定任务中断",
            }).eq("id", aid).eq("tenant_id", tid).execute()
            logger.info("清理孤儿会话: %s", sid)
    except Exception:
        logger.exception("cleanup_orphaned_running_sessions 异常")


async def expire_stale_sessions_loop() -> None:
    """后台任务：每 60 秒扫描并过期超时的 awaiting_* 会话。"""
    from services.supabase_client import get_supabase

    while True:
        try:
            await asyncio.sleep(60)
            sb = get_supabase(None)
            now = datetime.now(timezone.utc).isoformat()
            result = (
                sb.table("platform_binding_sessions")
                .select("id, account_id, tenant_id, status")
                .in_("status", ["awaiting_sms", "awaiting_qr", "awaiting_password_2fa"])
                .lt("expires_at", now)
                .execute()
            )
            for row in result.data or []:
                sid = row["id"]
                tid = row["tenant_id"]
                aid = row["account_id"]
                sb.table("platform_binding_sessions").update({
                    "status": "expired",
                    "error_message": "会话等待超时，已自动过期",
                    "updated_at": _now_iso(),
                }).eq("id", sid).eq("tenant_id", tid).execute()
                sb.table("platform_configs").update({
                    "status": "needsLogin",
                    "is_connected": False,
                    "last_error": "绑定会话超时",
                }).eq("id", aid).eq("tenant_id", tid).execute()
                await emit_binding_event(sid, "error", {"message": "会话等待超时，已自动过期"})
                _close_binding_stream(sid)
                logger.info("过期会话: %s", sid)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("expire_stale_sessions_loop 异常")
