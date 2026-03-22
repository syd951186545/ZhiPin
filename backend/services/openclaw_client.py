"""
OpenClaw HTTP + SSE 客户端

负责向 OpenClaw Responses API 发送 prompt 并接收 SSE 流式响应。
截图策略：
  1. 先把原始截图引用转换为后端同源代理 URL，立即返回前端展示
  2. 再异步拉取图片并上传 Supabase，供数据库持久化使用
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional

import httpx

from config import get_settings
from services.screenshot_service import service as screenshot_service

REQUEST_TIMEOUT = 15.0
SSE_TIMEOUT = 300.0  # 5 minutes per step

_MARKDOWN_IMG_RE = re.compile(r'!\[.*?\]\(((?:file://|https?://)[^)]+\.(?:png|jpg|jpeg|webp)(?:\?[^)]*)?)\)')
_PLAIN_PATH_RE = re.compile(r'(/(?:tmp|home|root|var|opt)/[^\s\'"<>|]*\.(?:png|jpg|jpeg|webp))')
_HTTP_IMAGE_RE = re.compile(r'(https?://[^\s\'"<>|]*\.(?:png|jpg|jpeg|webp)(?:\?[^\s\'"<>|]*)?)')


@dataclass
class StepResult:
    """单步执行结果。"""

    success: bool
    accumulated_text: str = ""
    screenshots: list[str] = field(default_factory=list)  # 实时代理 URL
    persisted_screenshots: list[str] = field(default_factory=list)  # 已完成持久化的 URL
    pending_uploads: list[asyncio.Task[Optional[str]]] = field(default_factory=list)
    error: Optional[str] = None


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
        self.auth_token = auth_token or settings.openclaw_auth_token
        self.agent_id = agent_id or settings.openclaw_agent_id

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json",
            "x-openclaw-agent-id": self.agent_id,
        }

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
                "请使用浏览器内置截图能力截图当前页面。"
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
        def _from_output(obj: dict) -> Optional[str]:
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

        return data.get("screenshot") or data.get("image_url")


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
