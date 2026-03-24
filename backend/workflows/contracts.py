"""
工作流运行时标准契约。

提供错误码、截图产物、步骤校验结果与默认校验逻辑。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse
from uuid import uuid4

ERROR_AUTH_REQUIRED = "AUTH_REQUIRED"
ERROR_DOM_CHANGED = "DOM_CHANGED"
ERROR_ANTI_BOT = "ANTI_BOT"
ERROR_NETWORK = "NETWORK"
ERROR_DATA_MISSING = "DATA_MISSING"
ERROR_TOOL = "TOOL_ERROR"
ERROR_UNKNOWN = "UNKNOWN"

DEFAULT_RETRIABLE_ERROR_CODES = (
    ERROR_NETWORK,
    ERROR_DOM_CHANGED,
    ERROR_TOOL,
)


@dataclass
class RetryPolicy:
    max_attempts: int = 1
    retriable_codes: tuple[str, ...] = DEFAULT_RETRIABLE_ERROR_CODES
    backoff_seconds: float = 1.0


@dataclass
class ArtifactRef:
    artifact_id: str
    run_id: str
    step_id: str
    artifact_type: str = "screenshot"
    source: str = "openclaw_browser"
    capture_phase: str = "after_action"
    mime_type: str = "image/png"
    storage_key: Optional[str] = None
    preview_url: Optional[str] = None
    live_url: Optional[str] = None
    signed_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    captured_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @classmethod
    def create(
        cls,
        *,
        run_id: str,
        step_id: str,
        capture_phase: str,
        preview_url: Optional[str] = None,
        live_url: Optional[str] = None,
        signed_url: Optional[str] = None,
        storage_key: Optional[str] = None,
    ) -> "ArtifactRef":
        return cls(
            artifact_id=f"artifact_{uuid4().hex}",
            run_id=run_id,
            step_id=step_id,
            capture_phase=capture_phase,
            preview_url=preview_url,
            live_url=live_url,
            signed_url=signed_url,
            storage_key=storage_key,
        )

    def to_event(self) -> dict:
        return {
            "artifact_id": self.artifact_id,
            "run_id": self.run_id,
            "step_id": self.step_id,
            "artifact_type": self.artifact_type,
            "source": self.source,
            "capture_phase": self.capture_phase,
            "mime_type": self.mime_type,
            "storage_key": self.storage_key,
            "preview_url": self.preview_url,
            "live_url": self.live_url,
            "signed_url": self.signed_url,
            "width": self.width,
            "height": self.height,
            "captured_at": self.captured_at,
            "content_url": f"/api/artifacts/{self.artifact_id}/content",
        }


@dataclass
class StepVerificationOutcome:
    success: bool
    error: Optional[str] = None
    error_code: Optional[str] = None
    details: dict = field(default_factory=dict)


def infer_error_code(message: str = "", text: str = "", step_id: str = "") -> str:
    haystack = f"{message}\n{text}\n{step_id}".lower()

    if any(token in haystack for token in ("未登录", "登录页", "login", "session", "会话失效", "认证失败")):
        return ERROR_AUTH_REQUIRED
    if any(token in haystack for token in ("滑块", "风控", "人机验证", "captcha", "bot")):
        return ERROR_ANTI_BOT
    if any(token in haystack for token in ("元素", "selector", "页面结构", "dom", "找不到", "弹窗遮罩")):
        return ERROR_DOM_CHANGED
    if any(token in haystack for token in ("timeout", "超时", "请求失败", "网络", "http", "连接失败")):
        return ERROR_NETWORK
    if any(token in haystack for token in ("缺失", "未提供", "为空", "必填", "字段", "岗位详情")):
        return ERROR_DATA_MISSING
    if any(token in haystack for token in ("openclaw", "tool", "agent", "截图失败", "浏览器工具")):
        return ERROR_TOOL
    return ERROR_UNKNOWN


def default_step_verifier(step_id: str, text: str, explicit_error: Optional[str] = None) -> StepVerificationOutcome:
    text = text or ""
    if explicit_error:
        return StepVerificationOutcome(
            success=False,
            error=explicit_error,
            error_code=infer_error_code(explicit_error, text, step_id),
        )

    failed_marker = f"[STEP_FAILED:{step_id}]"
    done_marker = f"[STEP_DONE:{step_id}]"

    if failed_marker in text:
        return StepVerificationOutcome(
            success=False,
            error=f"步骤 {step_id} 返回失败标记",
            error_code=infer_error_code(failed_marker, text, step_id),
            details={"failed_marker": failed_marker},
        )

    if done_marker in text:
        return StepVerificationOutcome(
            success=True,
            details={"done_marker": done_marker},
        )

    return StepVerificationOutcome(
        success=False,
        error=f"步骤 {step_id} 未返回完成标记",
        error_code=infer_error_code("", text, step_id),
    )


def extract_storage_key(url: Optional[str]) -> Optional[str]:
    if not url:
        return None

    parsed = urlparse(url)
    path = parsed.path or ""
    public_marker = "/storage/v1/object/public/"
    signed_marker = "/storage/v1/object/sign/"

    for marker in (public_marker, signed_marker):
        if marker in path:
            return path.split(marker, 1)[1].lstrip("/")

    return None
