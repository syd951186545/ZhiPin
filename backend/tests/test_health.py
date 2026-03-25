"""GET /api/health 健康检查测试。"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_health_returns_ok(client):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(return_value=mock_response)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("services.openclaw_health.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.get("/api/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "jiling-platform-workflow"
    assert body["backend"]["status"] == "ok"
    assert body["openclaw"]["status"] == "ok"


@pytest.mark.asyncio
async def test_health_returns_degraded_when_openclaw_unreachable(client):
    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(side_effect=OSError("connection refused"))
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("services.openclaw_health.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.get("/api/health")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["openclaw"]["status"] == "error"
