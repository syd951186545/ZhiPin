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
    build_bind_start_prompt,
    build_bind_submit_prompt,
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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _future_iso(minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


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
        return "completed"
    return {
        "LOGGED_IN": "completed",
        "AWAIT_SMS": "awaiting_sms",
        "AWAIT_QR": "awaiting_qr",
        "AWAIT_PASSWORD_2FA": "awaiting_password_2fa",
        "FAILED": "failed",
    }.get(parsed_state, "failed")


def _account_patch_for_status(
    account: PlatformAccountRow,
    action: str,
    status: str,
    reason: str,
    session_id: str,
    parsed_state: str,
    identifier_masked: Optional[str],
) -> dict[str, Any]:
    patch: dict[str, Any] = {
        "login_state": parsed_state,
        "last_error": reason or None,
    }
    if identifier_masked:
        patch["login_identifier_masked"] = identifier_masked

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
                "login_state": "FAILED",
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
) -> dict[str, Any]:
    patch: dict[str, Any] = {
        "status": status,
        "step_key": step_key,
        "error_message": reason or None,
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
        nonlocal latest_screenshot
        if screenshots:
            latest_screenshot = screenshots[-1]
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

    corrected_prompt = prompt
    last_result: Optional[StepResult] = None
    last_parsed: Optional[dict[str, Any]] = None

    for attempt in range(1, 4):
        if attempt > 1:
            corrected_prompt = (
                prompt
                + "\n\n【纠偏要求】上一次未能稳定完成，请刷新快照、确认单标签页、重新选择元素并严格输出结构化标记。"
            )
            await emit_binding_event(
                session_id,
                "state",
                {"message": f"第 {attempt} 次尝试纠偏执行", "attempt": attempt},
            )

        result = await openclaw.execute_step(
            prompt=corrected_prompt,
            session_id=session_key,
            step_id=f"binding_{attempt}",
            on_progress=on_progress,
            screenshot_uploader=uploader,
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
        latest_screenshot = screenshots[-1] if screenshots else binding_session.get("latest_screenshot_url")

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
                "latest_screenshot": latest_screenshot,
                "screenshots": screenshots,
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
                },
            )
    except Exception as exc:
        logger.exception("平台账号工作流执行失败: %s", session_id)
        update_binding_session(
            session_id,
            tenant_id,
            {"status": "failed", "error_message": str(exc), "updated_at": _now_iso()},
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


def start_bind_session(
    *,
    account: PlatformAccountRow,
    tenant_id: str,
    auth_token: Optional[str],
    payload: dict[str, Any],
) -> PlatformBindingSessionRow:
    prompt = build_bind_start_prompt(account, payload)
    update_platform_account(
        account["id"],
        tenant_id,
        {
            "status": "verifying",
            "is_connected": False,
            "login_method": payload.get("login_method"),
            "account_name": payload.get("login_name") or account.get("account_name"),
            "last_error": None,
        },
        auth_token=auth_token,
    )
    return create_action_session(
        account=account,
        tenant_id=tenant_id,
        action="bind",
        auth_token=auth_token,
        prompt=prompt,
    )


def submit_bind_session(
    *,
    account: PlatformAccountRow,
    binding_session: PlatformBindingSessionRow,
    tenant_id: str,
    auth_token: Optional[str],
    payload: dict[str, Any],
) -> PlatformBindingSessionRow:
    prompt = build_bind_submit_prompt(account, binding_session, payload)
    return create_action_session(
        account=account,
        tenant_id=tenant_id,
        action="bind",
        auth_token=auth_token,
        prompt=prompt,
    )


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


def get_binding_session_snapshot(
    session_id: str,
    tenant_id: str,
    auth_token: Optional[str],
) -> Optional[PlatformBindingSessionRow]:
    return get_binding_session(session_id, tenant_id, auth_token=auth_token)
