"""
OpenClaw 平台账号持久会话辅助。
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
from datetime import datetime, timezone
from typing import Optional

from config import get_settings

logger = logging.getLogger(__name__)


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
    root = get_settings().openclaw_home_mount.strip()
    if not root:
        return

    path = os.path.join(root, ".openclaw", "workspace", "platform-session-meta")
    os.makedirs(path, exist_ok=True)
    target = os.path.join(path, f"{session_key}.json")
    with open(target, "w", encoding="utf-8") as f:
        json.dump(
            {
                **payload,
                "session_key": session_key,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def clear_session_artifacts(session_key: str) -> None:
    """
    尽最大可能清理本项目管理的会话痕迹。

    OpenClaw 内部浏览器持久化目录结构未在仓库中显式公开，因此这里采取两层策略：
    1. 删除项目自建的 metadata / mutex / 追踪文件
    2. 上层调用更换 browser_session_key，确保旧会话不再被复用
    """
    root = get_settings().openclaw_home_mount.strip()
    if not root:
        return

    candidates = [
        os.path.join(root, ".openclaw", "workspace", "platform-session-meta", f"{session_key}.json"),
        os.path.join(root, ".openclaw", "workspace", "memory", f"{session_key}.lock.json"),
        os.path.join(root, ".openclaw", "workspace", "memory", f"{session_key}.json"),
    ]

    for candidate in candidates:
        try:
            if os.path.isdir(candidate):
                shutil.rmtree(candidate, ignore_errors=True)
            elif os.path.exists(candidate):
                os.remove(candidate)
        except Exception as exc:
            logger.debug("清理会话文件失败 %s: %s", candidate, exc)


def try_acquire_browser_mutex(session_key: str, label: str) -> bool:
    root = get_settings().openclaw_home_mount.strip()
    if not root:
        return True

    memory_dir = os.path.join(root, ".openclaw", "workspace", "memory")
    os.makedirs(memory_dir, exist_ok=True)
    lock_path = os.path.join(memory_dir, f"{session_key}.lock.json")
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    if os.path.exists(lock_path):
        try:
            with open(lock_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
            started_at_ms = int(payload.get("startedAtMs", 0))
            if now_ms - started_at_ms < 5 * 60 * 1000:
                return False
        except Exception:
            pass

    with open(lock_path, "w", encoding="utf-8") as f:
        json.dump({"label": label, "startedAtMs": now_ms}, f)
    return True


def release_browser_mutex(session_key: str) -> None:
    root = get_settings().openclaw_home_mount.strip()
    if not root:
        return
    lock_path = os.path.join(root, ".openclaw", "workspace", "memory", f"{session_key}.lock.json")
    try:
        if os.path.exists(lock_path):
            os.remove(lock_path)
    except Exception as exc:
        logger.debug("释放浏览器互斥锁失败 %s: %s", lock_path, exc)
