"""
Supabase 认证与客户端初始化

提供：
  - get_supabase / get_service_supabase: 客户端单例
  - validate_supabase_user: JWT 校验 + 租户绑定
  - mask_login_identifier: 脱敏工具
"""

from typing import Optional

import httpx
from supabase import create_client, Client

from config import get_settings
from services.supabase_types import ValidatedSupabaseUser

_anon_client: Optional[Client] = None
_service_client: Optional[Client] = None


def get_supabase(auth_token: Optional[str] = None) -> Client:
    """
    获取 Supabase 客户端。

    如果提供了 auth_token（用户 JWT），则以用户身份操作（满足 RLS 策略）。
    否则返回匿名客户端单例（受 RLS 限制）。
    """
    global _anon_client
    settings = get_settings()

    if auth_token:
        client = create_client(settings.supabase_url, settings.supabase_anon_key)
        client.postgrest.auth(auth_token)
        return client

    if _anon_client is None:
        _anon_client = create_client(settings.supabase_url, settings.supabase_anon_key)
    return _anon_client


def get_service_supabase() -> Optional[Client]:
    """
    获取 service_role 级别的 Supabase 客户端。
    预留给未来系统任务/后台任务场景使用，当前工作流链路暂不启用。
    启用前应单独设计入口和权限边界，避免与用户态请求混用。
    """
    global _service_client
    settings = get_settings()
    if not settings.supabase_service_key:
        return None
    if _service_client is None:
        _service_client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _service_client


async def validate_supabase_user(
    auth_token: str,
    expected_user_id: Optional[str] = None,
    expected_tenant_id: Optional[str] = None,
) -> ValidatedSupabaseUser:
    """
    校验前端传来的 Supabase 用户 JWT，并返回后端确认过的用户身份。

    - auth.getUser: 校验 JWT 是否有效，并拿到真实 user_id
    - profiles: 读取租户信息，用于校验/覆盖前端透传 tenant_id
    """
    settings = get_settings()
    auth_url = settings.supabase_url.rstrip("/") + "/auth/v1/user"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                auth_url,
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "apikey": settings.supabase_anon_key,
                },
            )
            resp.raise_for_status()
    except Exception as exc:
        raise ValueError("Supabase 用户令牌无效或已过期") from exc

    user = resp.json() or {}
    user_id = user.get("id")
    if not user_id:
        raise ValueError("Supabase 用户令牌缺少用户标识")

    if expected_user_id and expected_user_id != user_id:
        raise PermissionError("请求中的 user_id 与当前登录用户不一致")

    profile_resp = (
        get_supabase(auth_token)
        .table("profiles")
        .select("tenant_id, role")
        .eq("id", user_id)
        .single()
        .execute()
    )
    profile = profile_resp.data or {}
    tenant_id = profile.get("tenant_id") or ""
    if not tenant_id:
        raise PermissionError("当前用户未绑定租户，禁止访问 Supabase 资源")

    if expected_tenant_id and expected_tenant_id != tenant_id:
        raise PermissionError("请求中的 tenant_id 与当前登录用户租户不一致")

    return {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "role": profile.get("role"),
    }


def mask_login_identifier(value: Optional[str]) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if raw.isdigit() and len(raw) >= 7:
        return f"{raw[:3]}****{raw[-4:]}"
    if len(raw) <= 2:
        return "*" * len(raw)
    if len(raw) <= 6:
        return raw[0] + "*" * (len(raw) - 2) + raw[-1]
    return raw[:2] + "*" * max(len(raw) - 4, 2) + raw[-2:]
