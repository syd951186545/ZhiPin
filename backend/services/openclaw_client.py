"""
OpenClaw HTTP + SSE 客户端

负责向 OpenClaw Responses API 发送 prompt 并接收 SSE 流式响应。
截图策略：
  1. 先把原始截图引用转换为后端同源代理 URL，立即返回前端展示
  2. 再异步拉取图片并上传 Supabase，供数据库持久化使用
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import quote
from uuid import uuid4

import httpx

from config import get_settings
from services.screenshot_service import service as screenshot_service
from services.session_crypto import decrypt_storage_state

REQUEST_TIMEOUT = 15.0
SSE_TIMEOUT = 300.0  # 5 minutes per step
BROWSER_STATUS_TIMEOUT = 5.0
BROWSER_READY_TIMEOUT = 45.0
GATEWAY_RESTART_TIMEOUT = 30.0
HOST_BROWSER_START_TIMEOUT = 15.0
HOST_BROWSER_RESTORE_RETRIES = 3
HOST_BROWSER_SCREENSHOT_RETRIES = 3
HOST_BROWSER_PROFILE = "openclaw"

_MARKDOWN_IMG_RE = re.compile(r'!\[.*?\]\(((?:file://|https?://)[^)]+\.(?:png|jpg|jpeg|webp)(?:\?[^)]*)?)\)')
_PLAIN_PATH_RE = re.compile(r'(/(?:tmp|home|root|var|opt)/[^\s\'"<>|]*\.(?:png|jpg|jpeg|webp))')
_HTTP_IMAGE_RE = re.compile(r'(https?://[^\s\'"<>|]*\.(?:png|jpg|jpeg|webp)(?:\?[^\s\'"<>|]*)?)')
_BROWSER_READY_RE = re.compile(r"\[BROWSER_READY:(OK|FAILED)\]")
_BROWSER_REASON_RE = re.compile(r"\[BROWSER_REASON:([^\]]{1,300})\]")
_LOGIN_STATE_RE = re.compile(r"\[LOGIN_STATE:(LOGGED_IN|FAILED|AWAIT_SMS|AWAIT_QR|AWAIT_PASSWORD_2FA|LOGGED_OUT)\]")


@dataclass
class StepResult:
    """单步执行结果。"""

    success: bool
    accumulated_text: str = ""
    screenshots: list[str] = field(default_factory=list)  # 实时代理 URL
    persisted_screenshots: list[str] = field(default_factory=list)  # 已完成持久化的 URL
    pending_uploads: list[asyncio.Task[Optional[str]]] = field(default_factory=list)
    error: Optional[str] = None


@dataclass
class BrowserReadyResult:
    """OpenClaw host browser 预检结果。"""

    ready: bool
    detail: str = ""
    http_status: int = 503
    status_snapshot: dict[str, Any] = field(default_factory=dict)


class OpenClawClient:
    """OpenClaw HTTP + SSE 客户端。"""

    def __init__(
        self,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        agent_id: Optional[str] = None,
    ):
        settings = get_settings()
        self.base_url = (base_url or settings.openclaw_base_url).rstrip("/")
        self.browser_base_url = (settings.openclaw_browser_base_url or "").rstrip("/")
        self.auth_token = auth_token or settings.openclaw_auth_token
        self.agent_id = agent_id or settings.openclaw_agent_id
        self._runtime_profiles_created: set[str] = set()

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json",
            "x-openclaw-agent-id": self.agent_id,
        }

    def _browser_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        return headers

    def _is_builtin_browser_profile(self, profile: str) -> bool:
        normalized = self._browser_profile(profile)
        return normalized in {HOST_BROWSER_PROFILE, "user"}

    def _runtime_config_path(self) -> Path:
        settings = get_settings()
        return Path(settings.openclaw_home_mount) / ".openclaw" / "openclaw.json"

    def _workspace_storage_state_path(self, session_id: str) -> Path:
        settings = get_settings()
        return Path(settings.openclaw_home_mount) / ".openclaw" / "workspace" / session_id / "storage_state.json"

    def _browser_profile(self, profile: str | None) -> str:
        raw = (profile or "").strip()
        if not raw:
            return HOST_BROWSER_PROFILE

        lowered = raw.lower()
        if lowered in {HOST_BROWSER_PROFILE, "user"}:
            return lowered

        normalized = re.sub(r"[^a-z0-9-]+", "-", lowered).strip("-")
        if normalized and len(normalized) <= 48:
            return normalized

        digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]
        return f"sess-{digest}"

    def _resolve_runtime_profile(self, session_id: str, profile: str | None = None) -> str:
        return self._browser_profile(profile or session_id or HOST_BROWSER_PROFILE)

    def _host_browser_user_data_dir(self, profile: str = HOST_BROWSER_PROFILE) -> Path:
        settings = get_settings()
        return Path(settings.openclaw_home_mount) / ".openclaw" / "browser" / self._browser_profile(profile) / "user-data"

    def _host_browser_capture_dir(self) -> Path:
        settings = get_settings()
        return Path(settings.openclaw_media_mount.rstrip("/")) / "browser" / "backend-captures"

    def _write_workspace_storage_state(self, session_id: str, storage_state: dict[str, Any]) -> None:
        path = self._workspace_storage_state_path(session_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(storage_state, ensure_ascii=False), encoding="utf-8")

    def _load_workspace_storage_state(self, session_id: str) -> Optional[dict[str, Any]]:
        path = self._workspace_storage_state_path(session_id)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
        return payload if isinstance(payload, dict) else None

    def _decode_encrypted_storage_state(self, ciphertext_b64: str) -> dict[str, Any]:
        ciphertext = base64.b64decode(ciphertext_b64)
        plaintext = decrypt_storage_state(ciphertext)
        payload = json.loads(plaintext)
        if not isinstance(payload, dict):
            raise ValueError("storageState 结构无效")
        return payload

    def _load_persisted_storage_state(
        self,
        session_id: str,
        encrypted_session_state: str = "",
    ) -> tuple[Optional[dict[str, Any]], str]:
        raw_ciphertext = (encrypted_session_state or "").strip()
        if raw_ciphertext:
            payload = self._decode_encrypted_storage_state(raw_ciphertext)
            self._write_workspace_storage_state(session_id, payload)
            return payload, "database"

        payload = self._load_workspace_storage_state(session_id)
        if payload:
            return payload, "workspace"
        return None, ""

    def _clear_stale_host_browser_locks(self, profile: str = HOST_BROWSER_PROFILE) -> bool:
        removed = False
        user_data_dir = self._host_browser_user_data_dir(profile)
        for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
            lock_path = user_data_dir / name
            try:
                if lock_path.is_symlink() or lock_path.exists():
                    lock_path.unlink()
                    removed = True
            except FileNotFoundError:
                continue
        return removed

    def _host_browser_allowed(self) -> BrowserReadyResult:
        config_path = self._runtime_config_path()
        try:
            payload = json.loads(config_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw 运行时配置缺失，无法确认 host browser 策略",
                http_status=503,
            )
        except Exception as exc:
            return BrowserReadyResult(
                ready=False,
                detail=f"OpenClaw 运行时配置不可读：{exc}",
                http_status=503,
            )

        agents_cfg = payload.get("agents") if isinstance(payload, dict) else {}
        defaults_sandbox_cfg = ((agents_cfg or {}).get("defaults") or {}).get("sandbox") or {}
        defaults_browser_cfg = (
            (defaults_sandbox_cfg or {}).get("browser") or {}
        )
        if defaults_sandbox_cfg.get("mode") == "off":
            return BrowserReadyResult(ready=True)
        if defaults_browser_cfg.get("allowHostControl") is True:
            return BrowserReadyResult(ready=True)

        for item in (agents_cfg or {}).get("list", []) or []:
            if not isinstance(item, dict) or item.get("id") != self.agent_id:
                continue
            sandbox_cfg = item.get("sandbox") or {}
            if sandbox_cfg.get("mode") == "off":
                return BrowserReadyResult(ready=True)
            browser_cfg = (sandbox_cfg.get("browser")) or {}
            if browser_cfg.get("allowHostControl") is True:
                return BrowserReadyResult(ready=True)

        return BrowserReadyResult(
            ready=False,
            detail=(
                "OpenClaw 当前仍在沙箱模式，未允许切换到 host browser；"
                "请设置 agents.list[].sandbox.mode=off 或 agents.defaults.sandbox.browser.allowHostControl=true"
            ),
            http_status=503,
        )

    async def _invoke_gateway(self, action: str, args: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{self.base_url}/tools/invoke",
                headers={
                    "Authorization": f"Bearer {self.auth_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "tool": "gateway",
                    "action": action,
                    "args": args,
                },
            )
            response.raise_for_status()

        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Gateway 返回格式无效")
        if payload.get("ok") is False:
            error = payload.get("error") or {}
            message = error.get("message") if isinstance(error, dict) else None
            raise ValueError(message or f"Gateway {action} 返回失败")

        result = payload.get("result", payload)
        if not isinstance(result, dict):
            raise ValueError("Gateway 返回结果格式无效")

        details = result.get("details")
        if isinstance(details, dict):
            inner = details.get("result")
            if isinstance(inner, dict):
                return inner

        nested = result.get("result")
        if isinstance(nested, dict):
            return nested
        return result

    async def _wait_for_gateway_ready(self) -> BrowserReadyResult:
        deadline = asyncio.get_running_loop().time() + GATEWAY_RESTART_TIMEOUT
        last_error = "OpenClaw 网关重载中"

        async with httpx.AsyncClient(timeout=BROWSER_STATUS_TIMEOUT) as client:
            while asyncio.get_running_loop().time() < deadline:
                try:
                    response = await client.get(
                        f"{self.base_url}/healthz",
                        headers=self._browser_headers(),
                    )
                    response.raise_for_status()
                    payload = response.json()
                    if isinstance(payload, dict) and payload.get("ok") is True:
                        return BrowserReadyResult(ready=True)
                except Exception as exc:
                    last_error = str(exc)
                await asyncio.sleep(1)

        return BrowserReadyResult(
            ready=False,
            detail=f"OpenClaw 网关重载超时：{last_error}",
            http_status=503,
        )

    async def _ensure_host_browser_control_runtime(self) -> BrowserReadyResult:
        current_state = self._host_browser_allowed()
        if current_state.ready:
            return current_state

        try:
            config_get_result = await self._invoke_gateway("config.get", {})
        except Exception as exc:
            return BrowserReadyResult(
                ready=False,
                detail=f"读取 OpenClaw 运行时配置失败：{exc}",
                http_status=503,
            )

        runtime_config = config_get_result.get("parsed") if isinstance(config_get_result, dict) else None
        base_hash = config_get_result.get("hash") if isinstance(config_get_result, dict) else None
        if not isinstance(runtime_config, dict) or not isinstance(base_hash, str) or not base_hash:
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw 运行时配置返回无效，无法启用 host browser",
                http_status=503,
            )

        runtime_config.setdefault("agents", {}).setdefault("defaults", {}).setdefault("sandbox", {}).setdefault(
            "browser", {}
        )["allowHostControl"] = True

        try:
            await self._invoke_gateway(
                "config.apply",
                {
                    "raw": json.dumps(runtime_config, ensure_ascii=False, indent=2),
                    "baseHash": base_hash,
                    "note": "Enable host browser control for JiLing verify",
                },
            )
        except Exception as exc:
            return BrowserReadyResult(
                ready=False,
                detail=f"写入 OpenClaw host browser 配置失败：{exc}",
                http_status=503,
            )

        gateway_ready = await self._wait_for_gateway_ready()
        if not gateway_ready.ready:
            return gateway_ready

        return BrowserReadyResult(ready=True, detail="host browser 控制已启用")

    async def _fetch_host_browser_status(self, profile: str = HOST_BROWSER_PROFILE) -> BrowserReadyResult:
        if not self.browser_base_url:
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw browser 状态地址未配置",
                http_status=503,
            )

        try:
            async with httpx.AsyncClient(timeout=BROWSER_STATUS_TIMEOUT) as client:
                response = await client.get(
                    f"{self.browser_base_url}/",
                    headers=self._browser_headers(),
                    params={"profile": self._browser_profile(profile)},
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            if status_code in (401, 403):
                detail = "OpenClaw browser 服务认证失败，请检查 token 配置"
            elif status_code == 404:
                detail_text = ""
                with contextlib.suppress(Exception):
                    payload = exc.response.json()
                    if isinstance(payload, dict):
                        detail_text = str(payload.get("error") or "")
                if "BrowserProfileNotFoundError" in detail_text:
                    detail = f"OpenClaw browser profile 不存在: {self._browser_profile(profile)}"
                else:
                    detail = "OpenClaw browser profile 不存在"
            else:
                detail = f"OpenClaw browser 服务不可用 ({status_code})"
            return BrowserReadyResult(ready=False, detail=detail, http_status=status_code)
        except Exception as exc:
            return BrowserReadyResult(
                ready=False,
                detail=f"OpenClaw browser 服务不可达：{exc}",
                http_status=503,
            )

        try:
            payload = response.json()
        except ValueError:
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw browser 服务返回了无效 JSON",
                http_status=503,
            )

        if not isinstance(payload, dict):
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw browser 服务状态格式无效",
                http_status=503,
            )
        if payload.get("enabled") is not True:
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw host browser 未启用",
                http_status=503,
                status_snapshot=payload,
            )
        if payload.get("detectError"):
            return BrowserReadyResult(
                ready=False,
                detail=f"OpenClaw host browser 检测失败：{payload.get('detectError')}",
                http_status=503,
                status_snapshot=payload,
            )
        if payload.get("running") is not True or payload.get("cdpReady") is not True:
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw host browser 尚未启动，系统将尝试自动拉起",
                http_status=503,
                status_snapshot=payload,
            )
        chosen_browser = payload.get("chosenBrowser") or payload.get("detectedBrowser")
        if not chosen_browser and not payload.get("executablePath"):
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw host browser 未选择可用浏览器",
                http_status=503,
                status_snapshot=payload,
            )

        return BrowserReadyResult(
            ready=True,
            status_snapshot=payload,
        )

    def _normalize_browser_start_detail(self, error: str, status_snapshot: dict[str, Any] | None = None) -> str:
        text = (error or "").strip()
        lowered = text.lower()
        if "profile appears to be in use" in lowered or "singletonlock" in lowered:
            return "OpenClaw host browser 配置目录被残留锁占用，请稍后重试"
        if "missing x server" in lowered or "$display" in lowered:
            return "OpenClaw host browser 当前为有界面模式，但服务器没有 DISPLAY，请改为 headless 模式"
        if "failed to start chrome cdp" in lowered:
            return "OpenClaw host browser 启动失败，请检查 Chromium/CDP 配置"
        if status_snapshot and status_snapshot.get("detectError"):
            return f"OpenClaw host browser 检测失败：{status_snapshot.get('detectError')}"
        return text or "OpenClaw host browser 启动失败"

    async def _ensure_runtime_browser_profile(self, profile: str) -> BrowserReadyResult:
        normalized = self._browser_profile(profile)
        if self._is_builtin_browser_profile(normalized):
            return BrowserReadyResult(ready=True, status_snapshot={"profile": normalized})
        if not self.browser_base_url:
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw browser 状态地址未配置",
                http_status=503,
            )

        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                response = await client.post(
                    f"{self.browser_base_url}/profiles/create",
                    headers={
                        **self._browser_headers(),
                        "Content-Type": "application/json",
                    },
                    json={
                        "name": normalized,
                        "driver": "openclaw",
                    },
                )
                if response.status_code == 409:
                    self._runtime_profiles_created.add(normalized)
                    return BrowserReadyResult(ready=True, status_snapshot={"profile": normalized})
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPStatusError as exc:
            return BrowserReadyResult(
                ready=False,
                detail=f"创建 OpenClaw browser profile 失败 ({exc.response.status_code})",
                http_status=exc.response.status_code,
            )
        except Exception as exc:
            return BrowserReadyResult(
                ready=False,
                detail=f"创建 OpenClaw browser profile 失败：{exc}",
                http_status=503,
            )

        if isinstance(payload, dict) and payload.get("error"):
            error = str(payload.get("error"))
            if "already exists" in error.lower():
                self._runtime_profiles_created.add(normalized)
                return BrowserReadyResult(ready=True, status_snapshot={"profile": normalized})
            return BrowserReadyResult(
                ready=False,
                detail=f"创建 OpenClaw browser profile 失败：{error}",
                http_status=503,
            )

        self._runtime_profiles_created.add(normalized)
        return BrowserReadyResult(
            ready=True,
            status_snapshot=payload if isinstance(payload, dict) else {"profile": normalized},
        )

    async def delete_runtime_browser_profile(self, profile: str) -> None:
        normalized = self._browser_profile(profile)
        if self._is_builtin_browser_profile(normalized) or not self.browser_base_url:
            return

        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                response = await client.delete(
                    f"{self.browser_base_url}/profiles/{quote(normalized, safe='')}",
                    headers=self._browser_headers(),
                )
                if response.status_code in (200, 404):
                    return
                response.raise_for_status()
        except Exception:
            print(f"[OpenClawClient] 删除 runtime profile 失败: {normalized}", flush=True)

    async def cleanup_runtime_browser_profiles(self) -> None:
        for profile in list(self._runtime_profiles_created):
            await self.delete_runtime_browser_profile(profile)
            self._runtime_profiles_created.discard(profile)

    async def _start_host_browser(
        self,
        status_snapshot: dict[str, Any] | None = None,
        profile: str = HOST_BROWSER_PROFILE,
    ) -> BrowserReadyResult:
        if not self.browser_base_url:
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw browser 状态地址未配置",
                http_status=503,
            )

        async def attempt_start() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                response = await client.post(
                    f"{self.browser_base_url}/start",
                    headers=self._browser_headers(),
                    params={"profile": self._browser_profile(profile)},
                )
                response.raise_for_status()
            payload = response.json()
            if isinstance(payload, dict) and payload.get("error"):
                raise ValueError(str(payload.get("error")))
            return payload if isinstance(payload, dict) else {}

        start_error = ""
        try:
            await attempt_start()
        except Exception as exc:
            start_error = str(exc)
            if "profile appears to be in use" in start_error.lower() and self._clear_stale_host_browser_locks(profile):
                try:
                    await attempt_start()
                    start_error = ""
                except Exception as retry_exc:
                    start_error = str(retry_exc)
            if start_error:
                return BrowserReadyResult(
                    ready=False,
                    detail=self._normalize_browser_start_detail(start_error, status_snapshot),
                    http_status=503,
                    status_snapshot=status_snapshot or {},
                )

        deadline = asyncio.get_running_loop().time() + HOST_BROWSER_START_TIMEOUT
        last_status = BrowserReadyResult(
            ready=False,
            detail="OpenClaw host browser 启动后仍未就绪",
            http_status=503,
            status_snapshot=status_snapshot or {},
        )
        while asyncio.get_running_loop().time() < deadline:
            last_status = await self._fetch_host_browser_status(profile=profile)
            if last_status.ready:
                return last_status
            await asyncio.sleep(1)

        return last_status

    async def _restore_storage_state_to_host_browser(
        self,
        *,
        cdp_url: str,
        storage_state: dict[str, Any],
    ) -> None:
        try:
            from playwright.async_api import async_playwright
        except ImportError as exc:
            raise RuntimeError("playwright 未安装，无法恢复持久登录态") from exc

        cookies = storage_state.get("cookies") or []
        origins = storage_state.get("origins") or []

        async with async_playwright() as playwright:
            browser = await playwright.chromium.connect_over_cdp(cdp_url, timeout=10_000)
            try:
                context = browser.contexts[0] if browser.contexts else None
                if context is None:
                    raise RuntimeError("host browser 未暴露可用 context")

                await context.clear_cookies()
                if cookies:
                    await context.add_cookies(cookies)

                for origin_item in origins:
                    if not isinstance(origin_item, dict):
                        continue
                    origin = str(origin_item.get("origin") or "").strip()
                    local_storage = origin_item.get("localStorage") or []
                    if not origin or not local_storage:
                        continue

                    page = await context.new_page()
                    try:
                        await page.goto(origin, wait_until="domcontentloaded", timeout=10_000)
                        await page.evaluate(
                            """(items) => {
                                window.localStorage.clear();
                                for (const item of items || []) {
                                    if (!item || typeof item.name !== "string") continue;
                                    window.localStorage.setItem(item.name, String(item.value ?? ""));
                                }
                            }""",
                            local_storage,
                        )
                    finally:
                        await page.close()
            finally:
                await browser.close()

    def _is_transient_restore_error(self, exc: Exception) -> bool:
        message = str(exc).lower()
        transient_markers = (
            "target page, context or browser has been closed",
            "browser has been closed",
            "context or browser has been closed",
            "connection refused",
            "connect_over_cdp",
            "cdp",
        )
        return any(marker in message for marker in transient_markers)

    async def _capture_host_browser_png(self, cdp_url: str) -> bytes:
        try:
            from playwright.async_api import async_playwright
        except ImportError as exc:
            raise RuntimeError("playwright 未安装，无法执行 CDP 截图") from exc

        async with async_playwright() as playwright:
            browser = await playwright.chromium.connect_over_cdp(cdp_url, timeout=10_000)
            try:
                context = browser.contexts[0] if browser.contexts else None
                if context is None:
                    raise RuntimeError("host browser 未暴露可用 context")

                pages = [page for page in context.pages if not page.is_closed()]
                if not pages:
                    raise RuntimeError("host browser 未暴露可用 page")

                page = next(
                    (
                        candidate
                        for candidate in reversed(pages)
                        if str(getattr(candidate, "url", "") or "").strip()
                        and str(getattr(candidate, "url", "") or "").strip() != "about:blank"
                    ),
                    pages[-1],
                )

                with contextlib.suppress(Exception):
                    await page.bring_to_front()
                with contextlib.suppress(Exception):
                    await page.wait_for_load_state("domcontentloaded", timeout=5_000)
                with contextlib.suppress(Exception):
                    await page.wait_for_load_state("networkidle", timeout=3_000)

                return await page.screenshot(
                    type="png",
                    full_page=True,
                    animations="disabled",
                    timeout=10_000,
                )
            finally:
                await browser.close()

    async def _store_host_browser_capture(self, image_bytes: bytes, session_id: str) -> str:
        capture_dir = self._host_browser_capture_dir()
        capture_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{self._browser_profile(HOST_BROWSER_PROFILE)}-{session_id}-{uuid4().hex}.png"
        file_path = capture_dir / filename
        await asyncio.to_thread(file_path.write_bytes, image_bytes)
        return file_path.as_posix()

    async def _restore_persisted_session(
        self,
        *,
        session_id: str,
        profile: str,
        status_snapshot: dict[str, Any],
        encrypted_session_state: str = "",
    ) -> BrowserReadyResult:
        try:
            storage_state, source = self._load_persisted_storage_state(
                session_id=session_id,
                encrypted_session_state=encrypted_session_state,
            )
        except Exception as exc:
            return BrowserReadyResult(
                ready=False,
                detail=f"持久化登录态读取失败：{exc}",
                http_status=503,
                status_snapshot=status_snapshot,
            )

        if not storage_state:
            return BrowserReadyResult(ready=True, detail="未找到可恢复的持久登录态", status_snapshot=status_snapshot)

        cdp_url = str(status_snapshot.get("cdpUrl") or "").strip()
        if not cdp_url:
            return BrowserReadyResult(
                ready=False,
                detail="OpenClaw host browser 未返回 CDP 地址，无法恢复登录态",
                http_status=503,
                status_snapshot=status_snapshot,
            )

        last_error: Exception | None = None
        current_status_snapshot = dict(status_snapshot)
        for attempt in range(1, HOST_BROWSER_RESTORE_RETRIES + 1):
            current_cdp_url = str(current_status_snapshot.get("cdpUrl") or cdp_url).strip()
            if not current_cdp_url:
                return BrowserReadyResult(
                    ready=False,
                    detail="OpenClaw host browser 未返回 CDP 地址，无法恢复登录态",
                    http_status=503,
                    status_snapshot=current_status_snapshot,
                )
            try:
                await self._restore_storage_state_to_host_browser(
                    cdp_url=current_cdp_url,
                    storage_state=storage_state,
                )
                break
            except Exception as exc:
                last_error = exc
                if attempt >= HOST_BROWSER_RESTORE_RETRIES or not self._is_transient_restore_error(exc):
                    return BrowserReadyResult(
                        ready=False,
                        detail=f"恢复持久登录态失败：{exc}",
                        http_status=503,
                        status_snapshot=current_status_snapshot,
                    )
                await asyncio.sleep(1)
                refreshed_status = await self._fetch_host_browser_status(profile=profile)
                if not refreshed_status.ready:
                    refreshed_status = await self._start_host_browser(
                        status_snapshot=refreshed_status.status_snapshot,
                        profile=profile,
                    )
                    if not refreshed_status.ready:
                        return refreshed_status
                current_status_snapshot = refreshed_status.status_snapshot or current_status_snapshot
        else:
            return BrowserReadyResult(
                ready=False,
                detail=f"恢复持久登录态失败：{last_error}",
                http_status=503,
                status_snapshot=current_status_snapshot,
            )

        return BrowserReadyResult(
            ready=True,
            detail=f"已从{source}恢复持久登录态",
            status_snapshot=current_status_snapshot,
        )

    def _browser_ready_prompt(self, platform_url: str, profile: str) -> str:
        profile_name = self._browser_profile(profile)
        target_url = platform_url.strip() if platform_url else "about:blank"
        return f"""你现在只执行浏览器可用性预检，不要做任何业务判断。

【硬性要求】
1. 只能使用 browser 工具。
2. 每次 browser 工具调用都必须显式使用 `target="host"` 和 `profile="{profile_name}"`。
3. 禁止使用默认 sandbox browser，禁止调用其他工具。

【预检步骤】
1. 先打开 about:blank。
2. 再访问 {target_url}，确认页面开始响应即可，不要求判断登录态。
3. 执行一次 browser snapshot，确认 host browser 可交互。

【输出要求】
- 若预检成功，只输出：
[BROWSER_READY:OK]
[BROWSER_REASON:host browser 可用]
- 若 browser 工具报错、不可用、超时或被拒绝，只输出：
[BROWSER_READY:FAILED]
[BROWSER_REASON:20字以内原因]"""

    def _normalize_browser_ready_detail(self, error: str = "", accumulated: str = "") -> str:
        text = "\n".join(part for part in (error, accumulated) if part).strip()
        lowered = text.lower()
        if "sandbox browser is unavailable" in lowered:
            return "OpenClaw 仍在尝试使用 sandbox browser，请检查 host browser 目标配置"
        if "target=\"host\"" in lowered and "allowhostcontrol" in lowered:
            return "OpenClaw 未允许 host browser 控制，请检查 allowHostControl 配置"
        if "timed out" in lowered or "超时" in text:
            return "OpenClaw host browser 响应超时，请重启浏览器网关后重试"
        if "browser unavailable" in lowered:
            return "OpenClaw browser 当前不可用，请检查浏览器网关"
        if "认证失败" in text or "unauthorized" in lowered:
            return "OpenClaw browser 认证失败，请检查 token 配置"
        return text or "OpenClaw browser-ready 预检失败"

    async def ensure_host_browser_ready(
        self,
        session_id: str,
        platform_url: str = "",
        encrypted_session_state: str = "",
        profile: str | None = None,
    ) -> BrowserReadyResult:
        if not session_id:
            return BrowserReadyResult(
                ready=False,
                detail="账号缺少持久会话键，请重新绑定后再验证",
                http_status=400,
            )

        resolved_profile = self._resolve_runtime_profile(session_id, profile)
        host_target_result = await self._ensure_host_browser_control_runtime()
        if not host_target_result.ready:
            return host_target_result

        status_result = await self._fetch_host_browser_status(profile=resolved_profile)
        if status_result.http_status == 404:
            profile_result = await self._ensure_runtime_browser_profile(resolved_profile)
            if not profile_result.ready:
                return profile_result
            status_result = await self._fetch_host_browser_status(profile=resolved_profile)
        if not status_result.ready:
            status_result = await self._start_host_browser(
                status_snapshot=status_result.status_snapshot,
                profile=resolved_profile,
            )
            if not status_result.ready:
                return status_result

        restore_result = await self._restore_persisted_session(
            session_id=session_id,
            profile=resolved_profile,
            status_snapshot=status_result.status_snapshot,
            encrypted_session_state=encrypted_session_state,
        )
        if not restore_result.ready:
            return restore_result

        try:
            smoke_result = await asyncio.wait_for(
                self.execute_step(
                    prompt=self._browser_ready_prompt(platform_url, profile=resolved_profile),
                    session_id=session_id,
                    step_id="browser_ready",
                ),
                timeout=BROWSER_READY_TIMEOUT,
            )
        except asyncio.TimeoutError:
            return BrowserReadyResult(
                ready=False,
                detail=f"OpenClaw host browser 预检超时（>{int(BROWSER_READY_TIMEOUT)}秒）",
                http_status=503,
                status_snapshot=status_result.status_snapshot,
            )

        if smoke_result.error:
            return BrowserReadyResult(
                ready=False,
                detail=self._normalize_browser_ready_detail(smoke_result.error, smoke_result.accumulated_text),
                http_status=503,
                status_snapshot=status_result.status_snapshot,
            )

        accumulated_text = smoke_result.accumulated_text or ""
        state_match = _BROWSER_READY_RE.search(accumulated_text)
        reason_match = _BROWSER_REASON_RE.search(accumulated_text)
        reason = reason_match.group(1).strip() if reason_match else ""
        if state_match and state_match.group(1) == "OK":
            return BrowserReadyResult(
                ready=True,
                detail=reason or "host browser 可用",
                status_snapshot=status_result.status_snapshot,
            )

        login_state_match = _LOGIN_STATE_RE.search(accumulated_text)
        if login_state_match and login_state_match.group(1) == "LOGGED_IN":
            return BrowserReadyResult(
                ready=True,
                detail=reason or "host browser 已恢复到登录态",
                status_snapshot=status_result.status_snapshot,
            )

        return BrowserReadyResult(
            ready=False,
            detail=reason or self._normalize_browser_ready_detail(accumulated=accumulated_text),
            http_status=503,
            status_snapshot=status_result.status_snapshot,
        )

    async def cancel_response(self, response_id: str) -> None:
        if not response_id:
            return
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{self.base_url}/v1/responses/{response_id}/cancel",
                    headers=self._headers(),
                )
        except Exception as e:
            print(f"[OpenClawClient] 取消 response 失败: {response_id} - {e}", flush=True)

    async def test_connection(self) -> dict:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(
                f"{self.base_url}/v1/responses",
                headers=self._headers(),
                json={
                    "model": "openclaw",
                    "input": "你好，请简短回复确认连接正常。",
                    "stream": False,
                },
            )
            resp.raise_for_status()
            return resp.json()

    async def execute_step(
        self,
        prompt: str,
        session_id: str,
        step_id: str,
        on_progress: Optional[Callable[[str, str, list[str]], Awaitable[None] | None]] = None,
        on_screenshot: Optional[Callable[[str], Awaitable[None] | None]] = None,
        screenshot_uploader: Optional[Callable[[bytes, str, str], Awaitable[Optional[str]]]] = None,
    ) -> StepResult:
        accumulated_text = ""
        screenshots: list[str] = []
        persisted_screenshots: list[str] = []
        pending_uploads: list[asyncio.Task[Optional[str]]] = []
        seen_refs: set[str] = set()
        response_id: Optional[str] = None

        async def emit_screenshot(raw_ref: str) -> None:
            ref = (raw_ref or "").strip()
            if not ref or ref in seen_refs:
                return
            seen_refs.add(ref)

            live_url = screenshot_service.build_proxy_url(ref)
            screenshots.append(live_url)
            if on_screenshot:
                await _maybe_await(on_screenshot, live_url)

            if screenshot_uploader:
                task = asyncio.create_task(
                    self._persist_screenshot(ref, screenshot_uploader),
                    name=f"screenshot-upload-{step_id}-{len(pending_uploads)}",
                )
                pending_uploads.append(task)
                task.add_done_callback(
                    lambda t: _append_persisted_screenshot(t, persisted_screenshots)
                )

        async def process_new_screenshots_in_text() -> None:
            candidates: list[str] = []
            for match in _MARKDOWN_IMG_RE.finditer(accumulated_text):
                candidates.append(match.group(1))
            for match in _HTTP_IMAGE_RE.finditer(accumulated_text):
                candidates.append(match.group(1))
            for match in _PLAIN_PATH_RE.finditer(accumulated_text):
                candidates.append(match.group(1))
            for candidate in candidates:
                await emit_screenshot(candidate)

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(SSE_TIMEOUT, connect=REQUEST_TIMEOUT)) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/v1/responses",
                    headers=self._headers(),
                    json={
                        "model": "openclaw",
                        "input": prompt,
                        "stream": True,
                        "user": session_id,
                    },
                ) as response:
                    response.raise_for_status()

                    buffer = ""
                    async for chunk in response.aiter_text():
                        buffer += chunk
                        while "\n\n" in buffer:
                            event_str, buffer = buffer.split("\n\n", 1)
                            event = self._parse_sse_event(event_str)
                            if not event:
                                continue

                            event_type, data = event
                            if event_type.startswith("response."):
                                response_id = response_id or _extract_response_id(data)

                            if event_type == "response.output_text.delta":
                                delta = data.get("delta", "")
                                if delta:
                                    accumulated_text += delta
                                    await process_new_screenshots_in_text()
                                    if on_progress:
                                        await _maybe_await(on_progress, delta, accumulated_text, [])
                            elif event_type == "response.failed":
                                await process_new_screenshots_in_text()
                                error_info = data.get("error", {})
                                error_msg = (
                                    error_info.get("message", "Agent 执行失败")
                                    if isinstance(error_info, dict)
                                    else str(error_info)
                                )
                                return StepResult(
                                    success=False,
                                    accumulated_text=accumulated_text,
                                    screenshots=screenshots,
                                    persisted_screenshots=persisted_screenshots,
                                    pending_uploads=pending_uploads,
                                    error=error_msg,
                                )
                            else:
                                screenshot_ref = self._extract_screenshot(data)
                                if screenshot_ref:
                                    await emit_screenshot(screenshot_ref)

        except httpx.HTTPStatusError as e:
            await process_new_screenshots_in_text()
            if e.response.status_code in (401, 403):
                error = "认证失败，请检查 Auth Token"
            else:
                error = f"请求失败 ({e.response.status_code})"
            return StepResult(
                success=False,
                accumulated_text=accumulated_text,
                screenshots=screenshots,
                persisted_screenshots=persisted_screenshots,
                pending_uploads=pending_uploads,
                error=error,
            )
        except httpx.TimeoutException:
            await process_new_screenshots_in_text()
            return StepResult(
                success=False,
                accumulated_text=accumulated_text,
                screenshots=screenshots,
                persisted_screenshots=persisted_screenshots,
                pending_uploads=pending_uploads,
                error="步骤执行超时",
            )
        except asyncio.CancelledError:
            await process_new_screenshots_in_text()
            if response_id:
                await asyncio.shield(self.cancel_response(response_id))
            raise
        except Exception as e:
            await process_new_screenshots_in_text()
            return StepResult(
                success=False,
                accumulated_text=accumulated_text,
                screenshots=screenshots,
                persisted_screenshots=persisted_screenshots,
                pending_uploads=pending_uploads,
                error=str(e),
            )

        await process_new_screenshots_in_text()
        step_failed = f"[STEP_FAILED:{step_id}]" in accumulated_text
        return StepResult(
            success=not step_failed,
            accumulated_text=accumulated_text,
            screenshots=screenshots,
            persisted_screenshots=persisted_screenshots,
            pending_uploads=pending_uploads,
            error=f"步骤 {step_id} 执行失败" if step_failed else None,
        )

    async def capture_screenshot(
        self,
        session_id: str,
        on_screenshot: Optional[Callable[[str], Awaitable[None] | None]] = None,
        screenshot_uploader: Optional[Callable[[bytes, str, str], Awaitable[Optional[str]]]] = None,
    ) -> StepResult:
        media_mount = get_settings().openclaw_media_mount.rstrip("/")
        return await self.execute_step(
            prompt=(
                "请使用浏览器内置截图能力截取当前页面的完整整页截图，不要只截可视区域首屏。"
                "优先直接返回截图工具产生的 image_url 或 markdown 图片链接，不要输出本地文件路径。"
                f"如果截图工具只能提供文件路径，截图必须位于稳定媒体目录 {media_mount}/browser/ 下，"
                "禁止输出 /tmp 或 /home 等本地绝对路径。"
                "然后输出 [STEP_DONE:_screenshot]。"
            ),
            session_id=session_id,
            step_id="_screenshot",
            on_screenshot=on_screenshot,
            screenshot_uploader=screenshot_uploader,
        )

    async def capture_host_browser_screenshot(
        self,
        session_id: str,
        on_screenshot: Optional[Callable[[str], Awaitable[None] | None]] = None,
        screenshot_uploader: Optional[Callable[[bytes, str, str], Awaitable[Optional[str]]]] = None,
        profile: str | None = None,
    ) -> StepResult:
        resolved_profile = self._resolve_runtime_profile(session_id, profile)
        status_result = await self._fetch_host_browser_status(profile=resolved_profile)
        if status_result.http_status == 404:
            profile_result = await self._ensure_runtime_browser_profile(resolved_profile)
            if not profile_result.ready:
                return StepResult(success=False, error=profile_result.detail)
            status_result = await self._fetch_host_browser_status(profile=resolved_profile)
        if not status_result.ready:
            status_result = await self._start_host_browser(
                status_snapshot=status_result.status_snapshot,
                profile=resolved_profile,
            )
            if not status_result.ready:
                return StepResult(
                    success=False,
                    error=status_result.detail or "host browser 未就绪，无法执行 CDP 截图",
                )

        current_status_snapshot = dict(status_result.status_snapshot or {})
        cdp_url = str(current_status_snapshot.get("cdpUrl") or "").strip()
        if not cdp_url:
            return StepResult(success=False, error="OpenClaw host browser 未返回 CDP 地址，无法执行截图")

        image_bytes: bytes | None = None
        last_error: Exception | None = None
        for attempt in range(1, HOST_BROWSER_SCREENSHOT_RETRIES + 1):
            current_cdp_url = str(current_status_snapshot.get("cdpUrl") or cdp_url).strip()
            if not current_cdp_url:
                return StepResult(success=False, error="OpenClaw host browser 未返回 CDP 地址，无法执行截图")
            try:
                image_bytes = await self._capture_host_browser_png(current_cdp_url)
                break
            except Exception as exc:
                last_error = exc
                if attempt >= HOST_BROWSER_SCREENSHOT_RETRIES or not self._is_transient_restore_error(exc):
                    return StepResult(success=False, error=f"CDP 截图失败：{exc}")
                await asyncio.sleep(1)
                refreshed_status = await self._fetch_host_browser_status(profile=resolved_profile)
                if not refreshed_status.ready:
                    refreshed_status = await self._start_host_browser(
                        status_snapshot=refreshed_status.status_snapshot,
                        profile=resolved_profile,
                    )
                    if not refreshed_status.ready:
                        return StepResult(success=False, error=refreshed_status.detail)
                current_status_snapshot = refreshed_status.status_snapshot or current_status_snapshot
        if image_bytes is None:
            return StepResult(success=False, error=f"CDP 截图失败：{last_error}")

        raw_ref = await self._store_host_browser_capture(image_bytes, session_id)
        live_url = screenshot_service.build_proxy_url(raw_ref)
        screenshots = [live_url]
        if on_screenshot:
            await _maybe_await(on_screenshot, live_url)

        persisted_screenshots: list[str] = []
        if screenshot_uploader:
            persisted_url = await screenshot_uploader(
                image_bytes,
                Path(raw_ref).name,
                "image/png",
            )
            if persisted_url:
                persisted_screenshots.append(persisted_url)

        return StepResult(
            success=True,
            screenshots=screenshots,
            persisted_screenshots=persisted_screenshots,
        )

    async def _persist_screenshot(
        self,
        raw_ref: str,
        screenshot_uploader: Callable[[bytes, str, str], Awaitable[Optional[str]]],
    ) -> Optional[str]:
        try:
            image_bytes, content_type = await screenshot_service.fetch_image_bytes(raw_ref)
            filename = _infer_filename(raw_ref, content_type)
            return await screenshot_uploader(image_bytes, filename, content_type)
        except Exception as e:
            print(f"[OpenClawClient] 截图持久化失败: {raw_ref} - {e}", flush=True)
            return None

    def _parse_sse_event(self, raw: str) -> Optional[tuple[str, dict]]:
        event_type = "message"
        data_str = ""

        for line in raw.split("\n"):
            if line.startswith("event:"):
                event_type = line[6:].strip()
            elif line.startswith("data:"):
                data_str += line[5:].strip()

        if not data_str:
            return None

        try:
            data = json.loads(data_str)
        except json.JSONDecodeError:
            data = {"raw": data_str}

        return event_type, data

    def _extract_screenshot(self, data: dict) -> Optional[str]:
        def _pick_local_ref(container: dict) -> Optional[str]:
            details = container.get("details")
            if isinstance(details, dict):
                direct_path = details.get("path")
                if isinstance(direct_path, str) and direct_path.strip():
                    return direct_path.strip()
                media = details.get("media")
                if isinstance(media, dict):
                    media_url = media.get("mediaUrl")
                    if isinstance(media_url, str) and media_url.strip():
                        return media_url.strip()
            return None

        def _from_output(obj: dict) -> Optional[str]:
            local_ref = _pick_local_ref(obj)
            if local_ref:
                return local_ref
            output = obj.get("output", {})
            if isinstance(output, dict) and output.get("type") == "computer_screenshot":
                return output.get("image_url")
            return None

        if data.get("type") == "computer_call_output":
            url = _from_output(data)
            if url:
                return url

        item = data.get("item") or data.get("output_item")
        if isinstance(item, dict) and item.get("type") == "computer_call_output":
            url = _from_output(item)
            if url:
                return url

        return _pick_local_ref(data) or data.get("screenshot") or data.get("image_url")


def _extract_response_id(data: dict) -> Optional[str]:
    if not isinstance(data, dict):
        return None
    if isinstance(data.get("response"), dict) and data["response"].get("id"):
        return data["response"]["id"]
    if data.get("response_id"):
        return data.get("response_id")
    if data.get("id") and str(data.get("id")).startswith("resp_"):
        return data.get("id")
    return None


def _append_persisted_screenshot(task: asyncio.Task[Optional[str]], target: list[str]) -> None:
    try:
        result = task.result()
    except Exception:
        return
    if result and result not in target:
        target.append(result)


def _infer_filename(raw_ref: str, content_type: str) -> str:
    match = re.search(r'([^/]+\.(?:png|jpg|jpeg|webp))$', raw_ref, re.IGNORECASE)
    if match:
        return match.group(1)
    ext = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
    }.get(content_type, ".bin")
    return f"screenshot{ext}"


async def _maybe_await(fn, *args):
    result = fn(*args)
    if asyncio.iscoroutine(result):
        await result
