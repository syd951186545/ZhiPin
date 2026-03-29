"""
OpenClaw 平台账号持久会话辅助。
"""

from __future__ import annotations

import hashlib
import logging
import re
import threading
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
_MUTEX_TTL_MS = 5 * 60 * 1000
_browser_mutexes: dict[str, dict[str, int | str]] = {}
_mutex_guard = threading.Lock()


def resolve_runtime_browser_profile(profile: str | None) -> str:
    raw = (profile or "").strip()
    if not raw:
        return "openclaw"

    lowered = raw.lower()
    if lowered in {"openclaw", "user"}:
        return lowered

    normalized = re.sub(r"[^a-z0-9-]+", "-", lowered).strip("-")
    if normalized and len(normalized) <= 48:
        return normalized

    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]
    return f"sess-{digest}"


def build_browser_session_key(tenant_id: str, platform: str, account_id: str, version: int = 1) -> str:
    base = f"{tenant_id}:{platform}:{account_id}:v{version}"
    digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:12]
    return f"tenant-{tenant_id}-platform-{platform}-account-{account_id}-v{version}-{digest}"


def rotate_browser_session_key(current_key: str, tenant_id: str, platform: str, account_id: str) -> str:
    version = 1
    marker = "-v"
    if current_key and marker in current_key:
        try:
            version_str = current_key.split(marker, 1)[1].split("-", 1)[0]
            version = int(version_str) + 1
        except Exception:
            version = 2
    return build_browser_session_key(tenant_id, platform, account_id, version=version)


def write_session_metadata(session_key: str, payload: dict) -> None:
    if session_key:
        logger.debug("跳过持久化会话元数据写入: session_key=%s payload_keys=%s", session_key, sorted(payload.keys()))


def clear_session_artifacts(session_key: str) -> None:
    """
    不直接读写 OpenClaw 持久化目录。

    上层通过轮换 browser_session_key 避免复用旧会话，这里只释放进程内互斥状态。
    """
    release_browser_mutex(session_key)


def try_acquire_browser_mutex(session_key: str, label: str) -> bool:
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    if not session_key:
        return True

    with _mutex_guard:
        payload = _browser_mutexes.get(session_key)
        if payload:
            started_at_ms = int(payload.get("startedAtMs", 0))
            if now_ms - started_at_ms < _MUTEX_TTL_MS:
                return False
        _browser_mutexes[session_key] = {"label": label, "startedAtMs": now_ms}
        return True


def release_browser_mutex(session_key: str) -> None:
    if not session_key:
        return
    with _mutex_guard:
        _browser_mutexes.pop(session_key, None)
