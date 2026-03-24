"""
GET /api/workflow/check-openclaw OpenClaw 健康检查测试。
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch, MagicMock

import httpx
import pytest


@pytest.mark.asyncio
async def test_openclaw_healthy(client):
    """OpenClaw 正常响应 200 时返回 ok。"""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(return_value=mock_response)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.workflow.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.get("/api/workflow/check-openclaw")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_openclaw_unreachable(client):
    """OpenClaw 不可达时返回 503。"""
    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.workflow.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.get("/api/workflow/check-openclaw")
    assert resp.status_code == 503
    assert "不可达" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_openclaw_http_error(client):
    """OpenClaw 返回 500 时返回 503。"""
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("500", request=MagicMock(), response=mock_response)
    )

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(return_value=mock_response)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.workflow.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.get("/api/workflow/check-openclaw")
    assert resp.status_code == 503
    assert "错误" in resp.json()["detail"]
