"""
OpenClaw HTTP + SSE 客户端

负责向 OpenClaw Responses API 发送 prompt 并接收 SSE 流式响应。
截图处理策略：
  1. 从 accumulated_text 扫描 AI 输出的截图文件路径
  2. 统一通过 OpenClaw Gateway 暴露的 HTTP 路径拉取图片字节
  3. 若提供 screenshot_uploader → 上传 Supabase Storage，返回公开 URL（持久化）
     否则 → 编码为 base64 data URL（即时展示，刷新后丢失）
"""

import asyncio
import base64
import json
import re
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

import httpx

from config import get_settings

REQUEST_TIMEOUT = 15.0
SSE_TIMEOUT = 300.0  # 5 minutes per step

# 匹配 Markdown 图片语法中的 file:// 截图路径
_MARKDOWN_IMG_RE = re.compile(r'!\[.*?\]\((file://[^)]+\.(?:png|jpg|jpeg|webp))\)')

# 匹配 OpenClaw AI 输出的原始文件路径（不含 file:// 前缀）。
# AI 可能用反引号、**粗体**、普通文本等格式输出，统一从 / 开始匹配：
#   `/home/sunyd/.openclaw/media/browser/xxx.png`
#   **/home/sunyd/.openclaw/media/browser/xxx.png**
#   路径为：/home/sunyd/.openclaw/media/browser/xxx.png
_PLAIN_PATH_RE = re.compile(r'(/[^\s\'"<>|]+\.openclaw[^\s\'"<>|]*\.(?:png|jpg|jpeg|webp))')


@dataclass
class StepResult:
    """单步执行结果"""
    success: bool
    accumulated_text: str = ""
    screenshots: list[str] = field(default_factory=list)
    error: Optional[str] = None


class OpenClawClient:
    """OpenClaw HTTP + SSE 客户端"""

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

    def _fetch_headers(self) -> dict[str, str]:
        """GET 图片资源的请求头"""
        return {
            "Authorization": f"Bearer {self.auth_token}",
            "x-openclaw-agent-id": self.agent_id,
        }

    async def cancel_response(self, response_id: str) -> None:
        """
        取消正在执行的 OpenClaw response，避免继续消耗 token。
        失败时静默处理（仅日志输出）。
        """
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
        """测试连接"""
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

    async def _fetch_and_store_screenshot(
        self,
        file_url: str,
        screenshot_uploader: Optional[Callable] = None,
    ) -> Optional[str]:
        """
        获取截图文件字节，然后上传 Supabase 或编码 base64。

        禁止读取宿主机挂载目录，统一通过 OpenClaw Gateway HTTP 路径获取截图。

        Args:
            file_url: OpenClaw AI 输出的截图路径（file:// 或绝对路径）
            screenshot_uploader: async (bytes, filename, content_type) -> Optional[str]

        Returns:
            可供前端直接展示的 URL 字符串，失败返回 None
        """
        # 去掉 file:// 前缀
        path = file_url[len("file://"):] if file_url.startswith("file://") else file_url

        content_type = "image/png" if path.endswith(".png") else "image/jpeg"
        marker = ".openclaw/"
        idx = path.find(marker)
        if idx == -1:
            print(f"[OpenClawClient] 无法解析截图路径: {file_url}", flush=True)
            return None
        relative = path[idx + len(marker):]
        http_url = f"{self.base_url}/{relative}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(http_url, headers=self._fetch_headers())
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", content_type).split(";")[0].strip()
                image_bytes = resp.content
        except Exception as e:
            print(f"[OpenClawClient] HTTP 获取截图失败 {http_url}: {e}", flush=True)
            return None

        # 上传 Supabase Storage 或 base64 编码
        if screenshot_uploader:
            m = re.search(r'([^/]+\.(?:png|jpg|jpeg|webp))$', file_url, re.IGNORECASE)
            filename = m.group(1) if m else f"screenshot_{int(time.time())}.png"
            result = await screenshot_uploader(image_bytes, filename, content_type)
            if result:
                return result
            print(f"[OpenClawClient] Storage 上传失败，回退 base64: {filename}", flush=True)

        encoded = base64.b64encode(image_bytes).decode("utf-8")
        return f"data:{content_type};base64,{encoded}"

    async def execute_step(
        self,
        prompt: str,
        session_id: str,
        step_id: str,
        on_progress: Optional[Callable] = None,
        screenshot_uploader: Optional[Callable] = None,
    ) -> StepResult:
        """
        执行一个工作流步骤：发送 prompt 到 OpenClaw，消费 SSE 流。

        Args:
            prompt: 步骤的 prompt 内容
            session_id: 会话 ID（保持浏览器上下文）
            step_id: 步骤标识符（用于检测 [STEP_DONE:xxx] 标记）
            on_progress: 进度回调 (text_delta, accumulated_text, screenshots)
            screenshot_uploader: async (bytes, filename, content_type) -> Optional[str]
                                  提供时上传 Supabase Storage，否则 base64

        Returns:
            StepResult 包含成功/失败状态、完整文本、截图 URL 列表
        """
        accumulated_text = ""
        screenshots: list[str] = []          # 最终 URL 列表（Supabase 公开 URL 或 base64）
        _seen_file_urls: set[str] = set()    # 已处理的 file:// URL（去重）
        response_id: Optional[str] = None

        async def _process_new_screenshots_in_text() -> bool:
            """
            扫描 accumulated_text 中新出现的截图文件路径，
            并通过 Gateway HTTP 路径获取图片字节。
            返回是否有新截图。
            """
            had_new = False

            candidates: list[str] = []
            for m in _MARKDOWN_IMG_RE.finditer(accumulated_text):
                candidates.append(m.group(1))
            for m in _PLAIN_PATH_RE.finditer(accumulated_text):
                candidates.append(m.group(1))

            for file_url in candidates:
                if file_url in _seen_file_urls:
                    continue
                _seen_file_urls.add(file_url)
                result_url = await self._fetch_and_store_screenshot(file_url, screenshot_uploader)
                if result_url:
                    screenshots.append(result_url)
                    had_new = True
                    tag = "Storage" if screenshot_uploader and not result_url.startswith("data:") else "base64"
                    print(f"[OpenClawClient] 截图({tag}): {file_url[-60:]}", flush=True)

            return had_new

        async def _handle_screenshot_url(url: str) -> None:
            """处理非文本事件中的截图 URL（已经是 http:// 格式）"""
            if url in _seen_file_urls:
                return
            _seen_file_urls.add(url)
            if url.startswith("file://"):
                result_url = await self._fetch_and_store_screenshot(url, screenshot_uploader)
            else:
                result_url = url  # 已是 http URL，直接使用
            if result_url:
                screenshots.append(result_url)
                if on_progress:
                    await _maybe_await(on_progress, "", accumulated_text, screenshots[:])

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
                        # SSE 事件以 \n\n 分隔
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
                                    # 从完整 accumulated_text 扫描（解决 Markdown 跨 chunk 问题）
                                    await _process_new_screenshots_in_text()
                                    if on_progress:
                                        await _maybe_await(on_progress, delta, accumulated_text, screenshots[:])

                            elif event_type == "response.failed":
                                error_info = data.get("error", {})
                                error_msg = (
                                    error_info.get("message", "Agent 执行失败")
                                    if isinstance(error_info, dict)
                                    else str(error_info)
                                )
                                # 失败前最后扫描一次，确保截图不丢失
                                await _process_new_screenshots_in_text()
                                return StepResult(
                                    success=False,
                                    accumulated_text=accumulated_text,
                                    screenshots=screenshots,
                                    error=error_msg,
                                )

                            else:
                                # 处理非文本事件（computer_call_output 等）中的截图
                                screenshot_url = self._extract_screenshot(data)
                                if screenshot_url:
                                    await _handle_screenshot_url(screenshot_url)

        except httpx.HTTPStatusError as e:
            await _process_new_screenshots_in_text()
            if e.response.status_code in (401, 403):
                return StepResult(
                    success=False,
                    accumulated_text=accumulated_text,
                    screenshots=screenshots,
                    error="认证失败，请检查 Auth Token",
                )
            return StepResult(
                success=False,
                accumulated_text=accumulated_text,
                screenshots=screenshots,
                error=f"请求失败 ({e.response.status_code})",
            )
        except httpx.TimeoutException:
            await _process_new_screenshots_in_text()
            return StepResult(
                success=False,
                accumulated_text=accumulated_text,
                screenshots=screenshots,
                error="步骤执行超时",
            )
        except asyncio.CancelledError:
            # 工作流被取消：收集已有截图后重新抛出
            await _process_new_screenshots_in_text()
            if response_id:
                await asyncio.shield(self.cancel_response(response_id))
            raise
        except Exception as e:
            await _process_new_screenshots_in_text()
            return StepResult(
                success=False,
                accumulated_text=accumulated_text,
                screenshots=screenshots,
                error=str(e),
            )

        # SSE 流正常结束后最后扫描一次（确保末尾截图不遗漏）
        await _process_new_screenshots_in_text()

        # 检查步骤完成标记
        step_failed = f"[STEP_FAILED:{step_id}]" in accumulated_text

        if step_failed:
            return StepResult(
                success=False,
                accumulated_text=accumulated_text,
                screenshots=screenshots,
                error=f"步骤 {step_id} 执行失败",
            )

        return StepResult(
            success=True,
            accumulated_text=accumulated_text,
            screenshots=screenshots,
        )

    def _parse_sse_event(self, raw: str) -> Optional[tuple[str, dict]]:
        """解析一个 SSE 事件块"""
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
        """
        从 SSE 事件数据中提取截图 URL。

        兼容多种 OpenAI Responses API / OpenClaw 格式：
        1. 直接: data["type"] == "computer_call_output"
        2. 嵌套: data["item"]["type"] == "computer_call_output"（response.output_item.* 事件）
        3. 顶层: data["screenshot"] 或 data["image_url"]
        """
        def _from_output(obj: dict) -> Optional[str]:
            output = obj.get("output", {})
            if isinstance(output, dict) and output.get("type") == "computer_screenshot":
                return output.get("image_url")
            return None

        # 格式 1: 顶层 type == computer_call_output
        if data.get("type") == "computer_call_output":
            url = _from_output(data)
            if url:
                return url

        # 格式 2: 嵌套在 item 字段（response.output_item.added/done 事件）
        item = data.get("item") or data.get("output_item")
        if isinstance(item, dict) and item.get("type") == "computer_call_output":
            url = _from_output(item)
            if url:
                return url

        # 格式 3: 顶层 screenshot / image_url 字段
        return data.get("screenshot") or data.get("image_url")

    async def capture_screenshot(
        self,
        session_id: str,
        screenshot_uploader: Optional[Callable] = None,
    ) -> Optional[str]:
        """
        向 OpenClaw 请求当前浏览器页面截图。

        发送最小 prompt，仅触发截图操作，返回单张截图 URL（Storage URL 或 base64）。
        用于在步骤完成/失败后补充一张"停留页面"截图。
        """
        result = await self.execute_step(
            prompt="截图当前页面，输出截图文件的完整路径。然后输出 [STEP_DONE:_screenshot]。",
            session_id=session_id,
            step_id="_screenshot",
            screenshot_uploader=screenshot_uploader,
        )
        return result.screenshots[0] if result.screenshots else None


def _extract_response_id(data: dict) -> Optional[str]:
    """从 OpenClaw SSE 事件中提取 response_id"""
    if not isinstance(data, dict):
        return None
    if isinstance(data.get("response"), dict) and data["response"].get("id"):
        return data["response"]["id"]
    if data.get("response_id"):
        return data.get("response_id")
    if data.get("id") and str(data.get("id")).startswith("resp_"):
        return data.get("id")
    return None


async def _maybe_await(fn, *args):
    """调用函数，如果是协程则 await"""
    result = fn(*args)
    if asyncio.iscoroutine(result):
        await result
