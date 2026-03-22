"""
OpenClaw 代理路由

由后端注入 Auth Token，前端无需保密信息。
"""

from __future__ import annotations

from typing import Dict, Iterable

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import Response, StreamingResponse

from config import get_settings
from services.screenshot_service import service as screenshot_service

router = APIRouter(prefix="/api/openclaw", tags=["openclaw"])


_HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "host",
}


def _filter_headers(headers: Dict[str, str]) -> Dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in _HOP_BY_HOP_HEADERS}

@router.get("/info")
async def openclaw_info():
    settings = get_settings()
    return {
        "agent_id": settings.openclaw_agent_id,
        "base_url": settings.openclaw_base_url,
    }


@router.get("/screenshot")
async def proxy_openclaw_screenshot(
    ref: str = Query(..., description="base64url 编码后的截图引用"),
    sig: str = Query(..., description="截图引用签名"),
):
    raw_ref = screenshot_service.decode_proxy_ref(ref, sig)
    content, content_type = await screenshot_service.fetch_image_bytes(raw_ref)
    return Response(content=content, media_type=content_type)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_openclaw(path: str, request: Request):
    settings = get_settings()
    base_url = settings.openclaw_base_url.rstrip("/")
    upstream_url = f"{base_url}/{path}"

    if request.url.query:
        upstream_url = f"{upstream_url}?{request.url.query}"

    req_body = await request.body()
    headers = _filter_headers(dict(request.headers))

    # 后端统一注入 OpenClaw 认证信息
    if settings.openclaw_auth_token:
        headers["Authorization"] = f"Bearer {settings.openclaw_auth_token}"

    # 保留前端传入的 agent id，没有则使用后端默认值
    if "x-openclaw-agent-id" not in {k.lower() for k in headers}:
        headers["x-openclaw-agent-id"] = settings.openclaw_agent_id

    client = httpx.AsyncClient(timeout=None)
    req = client.build_request(
        request.method,
        upstream_url,
        headers=headers,
        content=req_body if req_body else None,
    )
    resp = await client.send(req, stream=True)

    async def iter_response() -> Iterable[bytes]:
        try:
            async for chunk in resp.aiter_raw():
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    response_headers = _filter_headers(dict(resp.headers))
    return StreamingResponse(
        iter_response(),
        status_code=resp.status_code,
        headers=response_headers,
        media_type=resp.headers.get("content-type"),
    )
