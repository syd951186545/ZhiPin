"""
工作流 Prompt 工具函数
"""

from config import get_settings
from services.platform_session_store import resolve_runtime_browser_profile


def screenshot_instruction() -> str:
    """返回截图指令片段，供各 prompt 模板插入。"""
    media_mount = get_settings().openclaw_media_mount.rstrip("/")
    return (
        "如需截图，只能使用浏览器内置截图能力（不要使用 shell、不要保存到 /tmp）。"
        "优先直接返回截图工具产生的 image_url 或 markdown 图片链接，不要输出本地文件路径。"
        f"如果截图工具只能提供文件路径，截图必须生成在稳定媒体目录 {media_mount}/browser/ 下。"
        "禁止输出 /tmp 临时路径。"
    )


def runtime_browser_profile(state: dict) -> str:
    """统一计算运行态 browser profile，避免长 session key 直接透传给 host browser。"""
    raw_profile = (
        state.get("browser_profile")
        or state.get("session_id")
        or state.get("browser_session_key")
        or "openclaw"
    )
    return resolve_runtime_browser_profile(str(raw_profile))
