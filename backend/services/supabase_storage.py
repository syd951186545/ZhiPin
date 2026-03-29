"""
Supabase Storage 截图上传

提供：
  - upload_screenshot: 单张截图上传到 workflow-screenshots bucket
  - make_screenshot_uploader: 创建 OpenClawClient 使用的上传 callback
"""

import logging
import re
import time
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger(__name__)

SCREENSHOTS_BUCKET = "workflow-screenshots"


async def upload_screenshot(
    image_bytes: bytes,
    filename: str,
    content_type: str = "image/png",
    execution_id: str = "",
    auth_token: Optional[str] = None,
) -> Optional[str]:
    """
    上传截图到 Supabase Storage (workflow-screenshots bucket)。

    认证优先级：
      1. 传入了 auth_token（用户 JWT）→ 以认证用户身份上传（满足 RLS authenticated 策略）
      2. 当前不启用 service_role 兜底；未来如需支持系统任务，再单独开放
      3. 无用户 JWT → 返回 None，调用方回退到 base64

    存储路径: {execution_id}/{timestamp}_{filename}
    返回公开访问 URL，失败返回 None。
    """
    settings = get_settings()

    if auth_token:
        bearer = auth_token
        logger.debug("使用用户 JWT 上传截图")
    else:
        logger.debug("无可用认证 token，跳过 Storage 上传")
        return None

    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    ts = int(time.time() * 1000)
    folder = execution_id or f"ts_{ts}"
    storage_path = f"{folder}/{ts}_{safe_name}"

    storage_base = settings.supabase_url.rstrip("/") + "/storage/v1"
    upload_url = f"{storage_base}/object/{SCREENSHOTS_BUCKET}/{storage_path}"
    public_url = f"{storage_base}/object/public/{SCREENSHOTS_BUCKET}/{storage_path}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                upload_url,
                content=image_bytes,
                headers={
                    "Authorization": f"Bearer {bearer}",
                    "apikey": settings.supabase_anon_key,
                    "Content-Type": content_type,
                    "x-upsert": "true",
                },
            )
            resp.raise_for_status()
        logger.info(f"截图已上传 Storage: {storage_path}")
        return public_url
    except Exception as e:
        logger.warning(f"截图上传 Supabase Storage 失败 ({storage_path}): {e}")
        return None


def make_screenshot_uploader(execution_id: str, auth_token: Optional[str] = None):
    """
    创建截图上传 callback，供 OpenClawClient.execute_step 使用。

    返回值是 async callable: (bytes, filename, content_type) -> Optional[str]
    若 Storage 上传失败，openclaw_client 会自动回退 base64。
    """
    async def _uploader(image_bytes: bytes, filename: str, content_type: str) -> Optional[str]:
        return await upload_screenshot(image_bytes, filename, content_type, execution_id, auth_token)
    return _uploader
