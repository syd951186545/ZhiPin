"""
平台账号绑定工作流结果解析。

OpenClaw 必须输出结构化标记，后端仅信任这些标记推进状态机。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Optional

BindingState = Literal[
    "LOGGED_IN",
    "AWAIT_SMS",
    "AWAIT_QR",
    "AWAIT_PASSWORD_2FA",
    "FAILED",
]

_STATE_RE = re.compile(r"\[LOGIN_STATE:(LOGGED_IN|AWAIT_SMS|AWAIT_QR|AWAIT_PASSWORD_2FA|FAILED)\]")
_STEP_RE = re.compile(r"\[LOGIN_STEP:([A-Z0-9_:-]+)\]")
_REASON_RE = re.compile(r"\[LOGIN_REASON:([^\]]{1,300})\]")
_IDENTIFIER_RE = re.compile(r"\[LOGIN_IDENTIFIER:([^\]]{1,120})\]")


@dataclass
class PlatformBindingParseResult:
    state: BindingState
    step_key: str
    reason: str
    identifier_masked: Optional[str] = None


def parse_platform_binding_output(text: str) -> Optional[PlatformBindingParseResult]:
    state_match = _STATE_RE.search(text or "")
    if not state_match:
        return None

    step_match = _STEP_RE.search(text or "")
    reason_match = _REASON_RE.search(text or "")
    identifier_match = _IDENTIFIER_RE.search(text or "")

    return PlatformBindingParseResult(
        state=state_match.group(1),  # type: ignore[arg-type]
        step_key=(step_match.group(1) if step_match else "UNKNOWN"),
        reason=(reason_match.group(1).strip() if reason_match else ""),
        identifier_masked=(identifier_match.group(1).strip() if identifier_match else None),
    )
