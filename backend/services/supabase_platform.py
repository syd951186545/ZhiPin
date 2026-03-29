"""
Supabase 平台账号与绑定会话 CRUD

提供：
  - list/get/create/update/delete_platform_account
  - list/get/create/update_binding_session
  - attach_latest_binding_session
"""

from copy import deepcopy
from typing import Any, Optional

from services.supabase_auth import get_supabase
from services.supabase_types import PlatformAccountRow, PlatformBindingSessionRow


# ── Platform Accounts ──────────────────────────────────────


def list_platform_accounts(
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> list[PlatformAccountRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_configs")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


def get_platform_account(
    account_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> Optional[PlatformAccountRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_configs")
        .select("*")
        .eq("id", account_id)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def create_platform_account(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> PlatformAccountRow:
    sb = get_supabase(auth_token)
    result = sb.table("platform_configs").insert(row).execute()
    return (result.data or [{}])[0]


def update_platform_account(
    account_id: str,
    tenant_id: str,
    patch: dict[str, Any],
    auth_token: Optional[str] = None,
) -> PlatformAccountRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_configs")
        .update(patch)
        .eq("id", account_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return (result.data or [{}])[0]


def delete_platform_account(
    account_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> bool:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_configs")
        .delete()
        .eq("id", account_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return len(result.data or []) > 0


# ── Binding Sessions ───────────────────────────────────────


def list_binding_sessions(
    tenant_id: str,
    account_id: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> list[PlatformBindingSessionRow]:
    sb = get_supabase(auth_token)
    query = (
        sb.table("platform_binding_sessions")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
    )
    if account_id:
        query = query.eq("account_id", account_id)
    result = query.execute()
    return result.data or []


def get_binding_session(
    session_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> Optional[PlatformBindingSessionRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_binding_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def create_binding_session(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> PlatformBindingSessionRow:
    sb = get_supabase(auth_token)
    result = sb.table("platform_binding_sessions").insert(row).execute()
    return (result.data or [{}])[0]


def update_binding_session(
    session_id: str,
    tenant_id: str,
    patch: dict[str, Any],
    auth_token: Optional[str] = None,
) -> PlatformBindingSessionRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("platform_binding_sessions")
        .update(patch)
        .eq("id", session_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return (result.data or [{}])[0]


def attach_latest_binding_session(
    accounts: list[PlatformAccountRow],
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> list[dict[str, Any]]:
    if not accounts:
        return []

    sessions = list_binding_sessions(tenant_id, auth_token=auth_token)
    latest_by_account: dict[str, PlatformBindingSessionRow] = {}
    for session in sessions:
        account_id = session.get("account_id")
        if account_id and account_id not in latest_by_account:
            latest_by_account[account_id] = session

    enriched: list[dict[str, Any]] = []
    for account in accounts:
        item = deepcopy(account)
        item["latest_binding_session"] = latest_by_account.get(account.get("id", ""))
        enriched.append(item)
    return enriched
