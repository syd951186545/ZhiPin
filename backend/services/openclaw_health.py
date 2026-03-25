"""OpenClaw 健康检查与连通性探测。"""

from __future__ import annotations

from typing import Any

import httpx

from config import get_settings

HEALTH_ENDPOINTS = (
    "/healthz",
    "/api/health",
)


async def probe_openclaw() -> dict[str, Any]:
    settings = get_settings()
    base_url = settings.openclaw_base_url.rstrip("/")
    result: dict[str, Any] = {
        "status": "error",
        "base_url": base_url,
        "endpoint": "",
        "detail": "",
    }

    if not base_url:
        result["detail"] = "OpenClaw 网关地址未配置"
        return result

    headers: dict[str, str] = {}
    if settings.openclaw_auth_token:
        headers["Authorization"] = f"Bearer {settings.openclaw_auth_token}"

    last_error: str = "OpenClaw 未返回任何可用健康检查端点"
    async with httpx.AsyncClient(timeout=8.0) as client:
        for endpoint in HEALTH_ENDPOINTS:
            result["endpoint"] = endpoint
            try:
                resp = await client.get(f"{base_url}{endpoint}", headers=headers)
                resp.raise_for_status()
                result["status"] = "ok"
                result["detail"] = ""
                return result
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    last_error = "OpenClaw 未返回任何可用健康检查端点"
                    continue
                last_error = f"OpenClaw 返回错误: {exc.response.status_code}"
                break
            except Exception as exc:
                last_error = f"OpenClaw 不可达: {exc}"
                break

    result["detail"] = last_error
    return result
