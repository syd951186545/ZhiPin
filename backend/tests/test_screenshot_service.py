from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.screenshot_service import ScreenshotService


def _settings(tmp_path, **overrides):
    base = {
        "openclaw_base_url": "http://127.0.0.1:18789",
        "openclaw_auth_token": "fake-openclaw-token",
        "openclaw_agent_id": "fake-agent",
        "openclaw_home_mount": str(tmp_path),
        "openclaw_media_mount": str(tmp_path / ".openclaw" / "media"),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_fetch_image_bytes_reads_openclaw_media_url_from_local_mount(tmp_path):
    media_dir = tmp_path / ".openclaw" / "media" / "browser"
    media_dir.mkdir(parents=True)
    image_path = media_dir / "sample.png"
    image_bytes = b"\x89PNG\r\n\x1a\nfake-image"
    image_path.write_bytes(image_bytes)

    remote_url = "https://openclaw-media.example.com/media/browser/sample.png"

    with (
        patch("services.screenshot_service.get_settings", return_value=_settings(tmp_path)),
        patch("services.screenshot_service.httpx.AsyncClient") as mock_client_cls,
    ):
        service = ScreenshotService()
        content, content_type = await service.fetch_image_bytes(remote_url)

    assert content == image_bytes
    assert content_type == "image/png"
    mock_client_cls.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_image_bytes_fetches_network_when_remote_media_file_missing(tmp_path):
    remote_url = "https://openclaw-media.example.com/media/browser/missing.png"
    response = AsyncMock()
    response.raise_for_status = MagicMock(return_value=None)
    response.headers = {"content-type": "image/png"}
    response.content = b"remote-image"

    client = AsyncMock()
    client.get = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("services.screenshot_service.get_settings", return_value=_settings(tmp_path)),
        patch("services.screenshot_service.httpx.AsyncClient", return_value=client),
    ):
        service = ScreenshotService()
        content, content_type = await service.fetch_image_bytes(remote_url)

    assert content == b"remote-image"
    assert content_type == "image/png"
    client.get.assert_awaited_once()
