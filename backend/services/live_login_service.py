"""
noVNC 实时登录服务。

在容器内启动 Xvfb + Chromium + x11vnc + websockify 进程链，
用户通过 noVNC iframe 直接操作浏览器完成登录。
登录完成后通过 CDP 提取 storageState 并加密持久化。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from uuid import uuid4

from config import get_settings
from services.platform_catalog import get_platform_catalog_item
from services.platform_session_store import try_acquire_browser_mutex, release_browser_mutex
from services.session_crypto import encrypt_storage_state

logger = logging.getLogger(__name__)

# ── 配置 ──────────────────────────────────────────────────────────

MAX_CONCURRENT = int(os.getenv("LIVE_LOGIN_MAX_CONCURRENT", "2"))
SESSION_TIMEOUT = int(os.getenv("LIVE_LOGIN_TIMEOUT", "900"))  # 15 min
WARN_BEFORE = 120  # 到期前 2 分钟提醒

# display 编号从 :10 开始，避开系统默认 :0
_DISPLAY_BASE = 10
_VNC_PORT_BASE = 5900
_WS_PORT_BASE = 6800
_CDP_PORT_BASE = 9220

# Chromium 可执行文件路径（容器内）
_CHROMIUM_BIN = os.getenv("CHROME_BIN", "/usr/bin/chromium")

# 持久化路径
_LIVE_DATA_DIR = Path(os.getenv(
    "LIVE_LOGIN_DATA_DIR",
    "/opt/openclaw-home/.chromium-live",
))
_OPENCLAW_WORKSPACE = Path(os.getenv(
    "OPENCLAW_WORKSPACE_DIR",
    "/opt/openclaw-home/.openclaw/workspace",
))
_PID_DIR = _LIVE_DATA_DIR / ".pids"

# ── 数据结构 ──────────────────────────────────────────────────────


@dataclass
class LiveSession:
    session_id: str
    account_id: str
    tenant_id: str
    platform: str
    browser_session_key: str
    display: int
    pids: dict[str, int] = field(default_factory=dict)
    ws_port: int = 0
    cdp_port: int = 0
    started_at: float = 0.0
    login_url: str = ""


# ── 全局状态 ──────────────────────────────────────────────────────

_display_pool: list[int] = list(range(_DISPLAY_BASE, _DISPLAY_BASE + MAX_CONCURRENT))
_active_sessions: dict[str, LiveSession] = {}
_lock = asyncio.Lock()


# ── 公共 API ─────────────────────────────────────────────────────

async def start_live_session(
    account_id: str,
    tenant_id: str,
    platform: str,
    browser_session_key: str,
    login_url: str | None = None,
) -> LiveSession:
    """启动 noVNC 会话，返回 LiveSession。"""

    if not try_acquire_browser_mutex(browser_session_key, "live_login"):
        raise RuntimeError("该账号正在被其他操作使用，请稍后重试")

    async with _lock:
        if not _display_pool:
            release_browser_mutex(browser_session_key)
            raise RuntimeError(
                f"登录通道已满（最多 {MAX_CONCURRENT} 个并发），请稍后重试"
            )
        display_num = _display_pool.pop(0)

    session = LiveSession(
        session_id=str(uuid4()),
        account_id=account_id,
        tenant_id=tenant_id,
        platform=platform,
        browser_session_key=browser_session_key,
        display=display_num,
        ws_port=_WS_PORT_BASE + (display_num - _DISPLAY_BASE),
        cdp_port=_CDP_PORT_BASE + (display_num - _DISPLAY_BASE),
        started_at=time.time(),
        login_url=login_url or _default_login_url(platform),
    )

    try:
        await _start_process_chain(session)
    except Exception:
        await _cleanup_session(session)
        raise

    _active_sessions[session.session_id] = session
    _write_pid_file(session)
    logger.info(
        "Live login session started: %s display=:%d ws=:%d",
        session.session_id, session.display, session.ws_port,
    )
    return session


async def confirm_login(
    session_id: str,
    supabase_updater=None,
) -> dict:
    """用户确认登录后：CDP 提取 storageState → 加密 → 持久化 → 关闭会话。

    返回 {"is_logged_in": bool, "storage_state": dict | None}。
    """
    session = _active_sessions.get(session_id)
    if not session:
        raise KeyError(f"会话不存在或已关闭: {session_id}")

    state, is_logged_in = await _extract_and_verify_storage_state(
        session.cdp_port, session.platform,
    )

    result: dict = {
        "is_logged_in": is_logged_in,
        "storage_state": None,
        "persistence": {
            "workspace_saved": False,
            "db_saved": False,
            "workspace_detail": "",
            "db_detail": "",
        },
    }

    if is_logged_in and state:
        state_json = json.dumps(state, ensure_ascii=False)

        # 加密存储
        encrypted = encrypt_storage_state(state_json)

        # 写入 OpenClaw 可读的文件系统（原子写入）
        _write_storage_state_to_workspace(session.browser_session_key, state)
        workspace_ok, workspace_detail = _verify_storage_state_persisted(
            session.browser_session_key, state
        )
        result["persistence"]["workspace_saved"] = workspace_ok
        result["persistence"]["workspace_detail"] = workspace_detail

        # 通知上层持久化到 Supabase
        db_ok = False
        db_detail = ""
        if supabase_updater:
            update_result = await supabase_updater(
                session.account_id,
                encrypted=encrypted,
                login_state="LOGGED_IN",
            )
            if isinstance(update_result, dict):
                db_ok = bool(update_result.get("saved", False))
                db_detail = str(update_result.get("detail", ""))
            elif isinstance(update_result, bool):
                db_ok = update_result
            else:
                db_ok = True
        else:
            db_ok = True
            db_detail = "未提供数据库持久化回调，跳过校验"

        result["persistence"]["db_saved"] = db_ok
        result["persistence"]["db_detail"] = db_detail

        if workspace_ok and db_ok:
            result["storage_state"] = state
            result["is_logged_in"] = True
        else:
            result["is_logged_in"] = False

    # 登录成功后关闭 VNC 会话；失败则保留会话供用户继续操作
    if is_logged_in:
        await stop_live_session(session_id)

    return result


async def stop_live_session(session_id: str) -> None:
    """停止 noVNC 会话并释放资源。"""
    session = _active_sessions.pop(session_id, None)
    if not session:
        return
    await _cleanup_session(session)
    logger.info("Live login session stopped: %s", session_id)


def get_session(session_id: str) -> Optional[LiveSession]:
    return _active_sessions.get(session_id)


def get_session_time_remaining(session_id: str) -> Optional[float]:
    session = _active_sessions.get(session_id)
    if not session:
        return None
    elapsed = time.time() - session.started_at
    return max(0, SESSION_TIMEOUT - elapsed)


async def cleanup_expired_sessions() -> int:
    """清理超时会话，返回清理数量。"""
    now = time.time()
    expired = [
        sid for sid, s in _active_sessions.items()
        if now - s.started_at > SESSION_TIMEOUT
    ]
    for sid in expired:
        logger.warning("Live login session expired: %s", sid)
        await stop_live_session(sid)
    return len(expired)


def cleanup_orphaned_sessions() -> int:
    """后端重启时清理上次遗留的 noVNC 进程。"""
    cleaned = 0
    if not _PID_DIR.exists():
        return cleaned

    for pid_file in _PID_DIR.glob("*.json"):
        try:
            data = json.loads(pid_file.read_text())
            pids = data.get("pids", {})
            for name, pid in pids.items():
                _safe_kill(pid, name)
                cleaned += 1
            # 回收 display 到池中
            display = data.get("display")
            if display is not None and display not in _display_pool:
                _display_pool.append(display)
                _display_pool.sort()
        except Exception as e:
            logger.warning("清理孤儿 PID 文件失败: %s - %s", pid_file, e)
        finally:
            pid_file.unlink(missing_ok=True)

    if cleaned:
        logger.info("清理了 %d 个孤儿 noVNC 进程", cleaned)
    return cleaned


# ── 内部实现 ──────────────────────────────────────────────────────

def _default_login_url(platform: str) -> str:
    try:
        item = get_platform_catalog_item(platform)
        return item["enterprise_url"]
    except KeyError:
        return "https://www.zhipin.com/web/geek/job"


async def _start_process_chain(session: LiveSession) -> None:
    """启动 Xvfb → Chromium → x11vnc → websockify 进程链。"""
    display = f":{session.display}"
    data_dir = _LIVE_DATA_DIR / f"session-{session.session_id}"
    data_dir.mkdir(parents=True, exist_ok=True)

    # 1. Xvfb
    xvfb = await asyncio.create_subprocess_exec(
        "Xvfb", display, "-screen", "0", "1280x720x24", "-ac",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    session.pids["xvfb"] = xvfb.pid
    await asyncio.sleep(0.5)

    # 2. Chromium
    chromium = await asyncio.create_subprocess_exec(
        _CHROMIUM_BIN,
        f"--display={display}",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--window-size=1280,720",
        f"--remote-debugging-port={session.cdp_port}",
        "--remote-debugging-address=127.0.0.1",
        "--disable-blink-features=AutomationControlled",
        f"--user-data-dir={data_dir}",
        # ── 用户操作限制 ──────────────────────────────────────────────────────
        # kiosk 模式：隐藏地址栏/标签栏/窗口控件，禁用 Ctrl+T/W/N 等快捷键，
        # 用户无法关闭浏览器窗口、新开标签页或导航到其他 URL。
        # 注意：若登录流程依赖弹出窗口（OAuth popup），需改用 --app= 模式。
        "--kiosk",
        "--no-first-run",     # 跳过首次运行向导
        "--disable-infobars", # 隐藏「由自动化测试软件控制」提示条
        "--disable-translate", # 禁用翻译弹窗
        # ─────────────────────────────────────────────────────────────────────
        session.login_url,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    session.pids["chromium"] = chromium.pid
    await asyncio.sleep(1.0)

    # 3. x11vnc
    vnc_port = _VNC_PORT_BASE + (session.display - _DISPLAY_BASE)
    x11vnc = await asyncio.create_subprocess_exec(
        "x11vnc",
        "-display", display,
        "-nopw",
        "-listen", "127.0.0.1",
        "-rfbport", str(vnc_port),
        "-shared",
        "-forever",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    session.pids["x11vnc"] = x11vnc.pid
    await asyncio.sleep(0.3)

    # 4. websockify（直连模式，无需 token 认证，安全由 session_id UUID + nginx 保障）
    websockify = await asyncio.create_subprocess_exec(
        "websockify",
        f"--web=/usr/share/novnc",
        str(session.ws_port),
        f"127.0.0.1:{vnc_port}",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    session.pids["websockify"] = websockify.pid

    # 等待 websockify 就绪
    for _ in range(10):
        await asyncio.sleep(0.3)
        if websockify.returncode is not None:
            raise RuntimeError("websockify 启动失败")
        # 简单检查端口是否可连接
        try:
            _, writer = await asyncio.open_connection("127.0.0.1", session.ws_port)
            writer.close()
            await writer.wait_closed()
            return
        except (ConnectionRefusedError, OSError):
            continue

    raise RuntimeError(f"websockify 端口 {session.ws_port} 未在 3 秒内就绪")


async def _extract_and_verify_storage_state(
    cdp_port: int,
    platform: str,
) -> tuple[dict | None, bool]:
    """通过 CDP 提取 storageState 并验证登录态。"""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.error("playwright 未安装，无法提取 storageState")
        return None, False

    retries = 3
    last_error = None

    for attempt in range(retries):
        try:
            async with async_playwright() as p:
                browser = await p.chromium.connect_over_cdp(
                    f"http://127.0.0.1:{cdp_port}",
                    timeout=10_000,
                )
                context = browser.contexts[0] if browser.contexts else None
                if not context:
                    await browser.close()
                    return None, False

                state = await context.storage_state()
                page_signals = _collect_page_signals(context)
                await browser.close()

                is_logged_in = _check_login_cookies(state, platform, page_signals)
                return state, is_logged_in

        except Exception as e:
            last_error = e
            logger.warning(
                "CDP 提取 storageState 失败 (尝试 %d/%d): %s",
                attempt + 1, retries, e,
            )
            if attempt < retries - 1:
                await asyncio.sleep(1)

    logger.error("CDP 提取 storageState 最终失败: %s", last_error)
    return None, False


# Boss直聘登录成功后的关键 cookies
_PLATFORM_LOGIN_COOKIES: dict[str, dict[str, list[str]]] = {
    "boss_zhipin": {
        "zhipin.com": ["wt2"],
    },
    "58": {
        # 注意：58tj_uuid 仅是追踪类 cookie，不能单独作为登录态依据。
        # 这里优先使用更接近认证语义的 cookie 名称。
        "58.com": ["PPU", "58uname", "58name", "58cooper", "id58"],
        "vip.58.com": ["PPU", "58uname", "58cooper", "id58"],
        "passport.58.com": ["PPU", "58uname", "58cooper", "id58"],
    },
    "liepin": {
        "liepin.com": ["__session_id"],
    },
}


def _collect_page_signals(context) -> dict[str, list[str]]:
    return {
        "urls": [str((page.url or "")) for page in context.pages],
        "titles": [],
    }


def _check_login_cookies(
    state: dict,
    platform: str,
    page_signals: dict[str, list[str]] | None = None,
) -> bool:
    """检查 storageState 中是否包含目标平台的登录 cookies。"""
    page_signals = page_signals or {"urls": [], "titles": []}
    expected = _PLATFORM_LOGIN_COOKIES.get(platform, {})
    if not expected:
        # 未配置的平台，默认信任用户确认
        return True

    cookies = state.get("cookies", [])
    if platform == "58":
        auth_cookie_hit = any(
            c.get("name") in {"PPU", "58uname", "58name", "58cooper", "id58"}
            and (
                "58.com" in str(c.get("domain", ""))
                or "ganji.com" in str(c.get("domain", ""))
            )
            for c in cookies
        )
        urls = [u.lower() for u in page_signals.get("urls", []) if u]
        login_page_hit = any(
            "passport.58.com/login" in u or "/login" in u and "58.com" in u
            for u in urls
        )
        vip_dashboard_hit = any(
            "vip.58.com" in u and "login" not in u and "passport.58.com" not in u
            for u in urls
        )
        # 58 平台使用多信号判定，避免仅靠单一追踪 cookie 误判。
        return (auth_cookie_hit and not login_page_hit) or (vip_dashboard_hit and not login_page_hit)

    # 其他平台保持“关键 cookie 全命中”的严格策略。
    for domain, cookie_names in expected.items():
        for name in cookie_names:
            found = any(
                c.get("name") == name and domain in str(c.get("domain", ""))
                for c in cookies
            )
            if not found:
                return False
    return True


def _write_storage_state_to_workspace(session_key: str, state: dict) -> None:
    """原子写入 storageState 到 OpenClaw workspace。"""
    target = _OPENCLAW_WORKSPACE / session_key
    target.mkdir(parents=True, exist_ok=True)
    final_path = target / "storage_state.json"
    tmp_path = target / "storage_state.json.tmp"
    tmp_path.write_text(json.dumps(state, ensure_ascii=False))
    os.replace(str(tmp_path), str(final_path))


def _verify_storage_state_persisted(session_key: str, expected_state: dict) -> tuple[bool, str]:
    target = _OPENCLAW_WORKSPACE / session_key / "storage_state.json"
    if not target.exists():
        return False, f"storage_state.json 不存在: {target}"

    try:
        raw = target.read_text()
        persisted = json.loads(raw)
    except Exception as exc:
        return False, f"storage_state.json 读取失败: {exc}"

    expected_cookies = expected_state.get("cookies", []) or []
    persisted_cookies = persisted.get("cookies", []) or []
    if len(persisted_cookies) < len(expected_cookies):
        return (
            False,
            f"cookie 数量异常，期望>={len(expected_cookies)}，实际={len(persisted_cookies)}",
        )

    return True, f"已持久化到 {target}"


async def _cleanup_session(session: LiveSession) -> None:
    """清理进程并回收 display。"""
    # 按反序杀进程：websockify → x11vnc → chromium → xvfb
    for name in reversed(["xvfb", "chromium", "x11vnc", "websockify"]):
        pid = session.pids.get(name)
        if pid:
            _safe_kill(pid, name)

    # 清理 PID 文件
    pid_file = _PID_DIR / f"{session.session_id}.json"
    pid_file.unlink(missing_ok=True)

    # 回收 display
    async with _lock:
        if session.display not in _display_pool:
            _display_pool.append(session.display)
            _display_pool.sort()

    # 释放互斥锁
    release_browser_mutex(session.browser_session_key)


def _safe_kill(pid: int, name: str) -> None:
    """安全杀死进程。"""
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    except Exception as e:
        logger.warning("杀死 %s (PID %d) 失败: %s", name, pid, e)


def _write_pid_file(session: LiveSession) -> None:
    """写入 PID 文件，供重启时清理孤儿进程。"""
    _PID_DIR.mkdir(parents=True, exist_ok=True)
    pid_file = _PID_DIR / f"{session.session_id}.json"
    pid_file.write_text(json.dumps({
        "session_id": session.session_id,
        "display": session.display,
        "pids": session.pids,
        "started_at": session.started_at,
    }))
