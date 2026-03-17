"""
OpenClaw HTTP + SSE 客户端

负责向 OpenClaw Agent 发送 prompt 并接收 SSE 流式响应。
每次调用返回完整的 AI 文本输出和截图列表。
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import AsyncGenerator, Callable, Optional

import httpx

from config import get_settings

REQUEST_TIMEOUT = 15.0
SSE_TIMEOUT = 300.0  # 5 minutes per step

# 匹配 Markdown 图片语法中的 file:// 截图路径
_MARKDOWN_IMG_RE = re.compile(r'!\[.*?\]\((file://[^)]+\.(?:png|jpg|jpeg|webp))\)')


@dataclass
class StepResult:
    """单步执行结果"""
    success: bool
    accumulated_text: str = ""
    screenshots: list[str] = field(default_factory=list)
    error: Optional[str] = None


# SSE 事件回调类型
ProgressCallback = Callable[[str, str, list[str]], None]  # (step_id, text_delta, screenshots)


class OpenClawClient:
    """OpenClaw HTTP + SSE 客户端"""

    def __init__(
        self,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        agent_id: Optional[str] = None,
    ):
        settings = get_settings()
        self.base_url = base_url or settings.openclaw_base_url
        self.auth_token = auth_token or settings.openclaw_auth_token
        self.agent_id = agent_id or settings.openclaw_agent_id

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json",
            "x-openclaw-agent-id": self.agent_id,
        }

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

    async def execute_step(
        self,
        prompt: str,
        session_id: str,
        step_id: str,
        on_progress: Optional[Callable] = None,
    ) -> StepResult:
        """
        执行一个工作流步骤：发送 prompt 到 OpenClaw，消费 SSE 流。

        Args:
            prompt: 步骤的 prompt 内容
            session_id: 会话 ID（保持浏览器上下文）
            step_id: 步骤标识符（用于检测 [STEP_DONE:xxx] 标记）
            on_progress: 进度回调 (text_delta, accumulated_text, screenshots)

        Returns:
            StepResult 包含成功/失败状态、完整文本、截图
        """
        accumulated_text = ""
        screenshots: list[str] = []

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

                            if event_type == "response.output_text.delta":
                                delta = data.get("delta", "")
                                if delta:
                                    accumulated_text += delta
                                    # 从新增文本中提取嵌入的截图
                                    new_screenshots = self._extract_screenshots_from_text(delta)
                                    for s in new_screenshots:
                                        if s not in screenshots:
                                            screenshots.append(s)
                                    if on_progress:
                                        await _maybe_await(on_progress, delta, accumulated_text, screenshots)

                            elif event_type == "response.failed":
                                error_info = data.get("error", {})
                                error_msg = error_info.get("message", "Agent 执行失败") if isinstance(error_info, dict) else str(error_info)
                                return StepResult(
                                    success=False,
                                    accumulated_text=accumulated_text,
                                    screenshots=screenshots,
                                    error=error_msg,
                                )

                            else:
                                # 检查截图
                                screenshot_url = self._extract_screenshot(data)
                                if screenshot_url:
                                    screenshots.append(screenshot_url)
                                    if on_progress:
                                        await _maybe_await(on_progress, "", accumulated_text, screenshots)

        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                return StepResult(success=False, error="认证失败，请检查 Auth Token")
            return StepResult(success=False, error=f"请求失败 ({e.response.status_code})")
        except httpx.TimeoutException:
            return StepResult(
                success=False,
                accumulated_text=accumulated_text,
                screenshots=screenshots,
                error="步骤执行超时",
            )
        except Exception as e:
            return StepResult(
                success=False,
                accumulated_text=accumulated_text,
                screenshots=screenshots,
                error=str(e),
            )

        # 检查步骤完成标记
        step_done = f"[STEP_DONE:{step_id}]" in accumulated_text
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
        """从 SSE 事件数据中提取截图 URL"""
        # computer_call_output 类型
        if data.get("type") == "computer_call_output":
            output = data.get("output", {})
            if isinstance(output, dict) and output.get("type") == "computer_screenshot":
                return output.get("image_url")

        # 直接包含 screenshot 字段
        return data.get("screenshot") or data.get("image_url")

    def _extract_screenshots_from_text(self, text: str) -> list[str]:
        """
        从 Markdown 文本中提取截图 URL。

        OpenClaw Agent 会将截图以 Markdown 图片格式嵌入文本：
          ![页面](file:///home/sunyd/.openclaw/media/browser/xxx.png)

        将 file:// 路径转换为可访问的 HTTP URL。
        """
        found = []
        for m in _MARKDOWN_IMG_RE.finditer(text):
            file_url = m.group(1)
            http_url = self._file_url_to_http(file_url)
            found.append(http_url)
        return found

    def _file_url_to_http(self, file_url: str) -> str:
        """
        将 file:///home/sunyd/.openclaw/media/... 转换为
        http://<openclaw_host>/media/...
        """
        prefix = "file:///home/sunyd/.openclaw/"
        if file_url.startswith(prefix):
            relative = file_url[len(prefix):]
            return f"{self.base_url.rstrip('/')}/{relative}"
        # 其他 file:// 路径原样返回
        return file_url


async def _maybe_await(fn, *args):
    """调用函数，如果是协程则 await"""
    result = fn(*args)
    if asyncio.iscoroutine(result):
        await result
