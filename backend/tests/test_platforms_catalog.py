"""GET /api/platforms/catalog 平台目录测试。"""

import pytest

EXPECTED_PLATFORM_KEYS = {"boss_zhipin", "58", "liepin", "zhilian", "51job", "lagou"}
REQUIRED_FIELDS = {"key", "name", "enterprise_url", "recommended_login_method", "supported_login_methods"}


@pytest.mark.asyncio
async def test_get_catalog_returns_all_platforms(client):
    """目录接口应返回全部 6 个平台。"""
    resp = await client.get("/api/platforms/catalog")
    assert resp.status_code == 200
    items = resp.json()["items"]
    returned_keys = {item["key"] for item in items}
    assert returned_keys == EXPECTED_PLATFORM_KEYS


@pytest.mark.asyncio
async def test_catalog_items_have_required_fields(client):
    """每个平台项必须包含关键字段。"""
    resp = await client.get("/api/platforms/catalog")
    items = resp.json()["items"]
    for item in items:
        missing = REQUIRED_FIELDS - set(item.keys())
        assert not missing, f"平台 {item.get('key', '?')} 缺少字段: {missing}"
        assert isinstance(item["supported_login_methods"], list)
        assert len(item["supported_login_methods"]) > 0
