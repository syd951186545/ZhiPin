"""
招聘平台目录 API。
"""

from fastapi import APIRouter

from services.platform_catalog import list_platform_catalog

router = APIRouter(prefix="/api/platforms", tags=["platforms"])


@router.get("/catalog")
async def get_platform_catalog():
    return {"items": list_platform_catalog()}
