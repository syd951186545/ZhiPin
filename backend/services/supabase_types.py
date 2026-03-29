"""
Supabase 数据类型定义

所有 TypedDict 数据结构，供各 supabase_* 模块共享引用。
"""

from typing import Any, Optional, TypedDict


class ValidatedSupabaseUser(TypedDict):
    user_id: str
    tenant_id: str
    role: Optional[str]


class PlatformAccountRow(TypedDict, total=False):
    id: str
    tenant_id: str
    platform: str
    name: str
    account_name: Optional[str]
    platform_url: Optional[str]
    login_method: Optional[str]
    browser_session_key: Optional[str]
    login_state: Optional[str]
    login_identifier_masked: Optional[str]
    last_error: Optional[str]
    last_bind_task_id: Optional[str]
    last_unbind_task_id: Optional[str]
    encrypted_session_state: Optional[str]
    config: dict[str, Any]
    is_connected: bool
    status: str
    last_verified: Optional[str]
    last_login: Optional[str]
    created_at: str
    updated_at: str


class PlatformBindingSessionRow(TypedDict, total=False):
    id: str
    account_id: str
    tenant_id: str
    action: str
    status: str
    step_key: Optional[str]
    openclaw_session_key: str
    latest_screenshot_url: Optional[str]
    qr_screenshot_url: Optional[str]
    awaiting_payload_schema: Optional[dict[str, Any]]
    retry_count: int
    error_message: Optional[str]
    output_text: Optional[str]
    expires_at: Optional[str]
    created_at: str
    updated_at: str


class TenantSettingsRow(TypedDict, total=False):
    id: str
    tenant_id: str
    openclaw_gateway_url: str
    openclaw_auth_token: Optional[str]
    proxy_mode: bool
    ai_model: str
    ai_api_key: Optional[str]
    ai_validation_status: Optional[str]
    ai_validation_message: Optional[str]
    ai_validated_at: Optional[str]
    notification_wecom_url: Optional[str]
    notification_email: Optional[str]
    audit_logging: bool
    data_retention_days: int
    company_name: str
    company_address: str
    company_size: str
    company_overview: str
    created_at: str
    updated_at: str


class WorkflowRunRow(TypedDict, total=False):
    execution_id: str
    tenant_id: str
    workflow_id: str
    workflow_name: Optional[str]
    status: str
    multi_platform: bool
    request_payload: dict[str, Any]
    result_payload: Optional[dict[str, Any]]
    steps_payload: dict[str, Any]
    step_order: list[str]
    events_payload: list[dict[str, Any]]
    accumulated_output: str
    current_platform: Optional[dict[str, Any]]
    latest_checkpoint: Optional[dict[str, Any]]
    handoff_required: Optional[dict[str, Any]]
    error_message: Optional[str]
    error_code: Optional[str]
    task_id: Optional[str]
    created_at: str
    updated_at: str
    completed_at: Optional[str]


class WorkflowArtifactRow(TypedDict, total=False):
    artifact_id: str
    execution_id: str
    tenant_id: str
    step_id: str
    artifact_type: str
    source: str
    capture_phase: str
    mime_type: str
    storage_key: Optional[str]
    preview_url: Optional[str]
    live_url: Optional[str]
    signed_url: Optional[str]
    width: Optional[int]
    height: Optional[int]
    captured_at: str
    created_at: str
    updated_at: str


class WorkflowCheckpointRow(TypedDict, total=False):
    checkpoint_id: str
    execution_id: str
    tenant_id: str
    step_id: str
    step_name: Optional[str]
    step_index: int
    attempt: int
    artifact_ids: list[str]
    payload: dict[str, Any]
    verified_at: str
    created_at: str
