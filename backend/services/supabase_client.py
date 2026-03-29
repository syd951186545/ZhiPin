"""
Supabase 客户端入口（向后兼容再导出）

实际实现已按领域拆分到以下模块：
  - supabase_types    — TypedDict 数据结构
  - supabase_auth     — 客户端初始化 / JWT 校验 / 脱敏
  - supabase_storage  — 截图上传到 Storage
  - supabase_platform — 平台账号 & 绑定会话 CRUD
  - supabase_tasks    — 租户设置 / 候选人 / 自动化任务 / 任务日志
  - supabase_workflow — 工作流运行时持久化

外部代码继续 `from services.supabase_client import ...` 即可，无需改动。
"""

from services.supabase_types import (
    ValidatedSupabaseUser,
    PlatformAccountRow,
    PlatformBindingSessionRow,
    TenantSettingsRow,
    WorkflowRunRow,
    WorkflowArtifactRow,
    WorkflowCheckpointRow,
)
from services.supabase_auth import (
    get_supabase,
    get_service_supabase,
    validate_supabase_user,
    mask_login_identifier,
)
from services.supabase_storage import (
    SCREENSHOTS_BUCKET,
    upload_screenshot,
    make_screenshot_uploader,
)
from services.supabase_platform import (
    list_platform_accounts,
    get_platform_account,
    create_platform_account,
    update_platform_account,
    delete_platform_account,
    list_binding_sessions,
    get_binding_session,
    create_binding_session,
    update_binding_session,
    attach_latest_binding_session,
)
from services.supabase_tasks import (
    get_tenant_settings,
    update_tenant_settings,
    create_candidates_batch,
    create_automation_task,
    update_automation_task,
    complete_automation_task,
    insert_task_log,
)
from services.supabase_workflow import (
    upsert_workflow_run,
    get_workflow_run,
    upsert_workflow_artifact,
    list_workflow_artifacts,
    get_workflow_artifact,
    upsert_workflow_checkpoint,
    list_workflow_checkpoints,
)

__all__ = [
    # types
    "ValidatedSupabaseUser",
    "PlatformAccountRow",
    "PlatformBindingSessionRow",
    "TenantSettingsRow",
    "WorkflowRunRow",
    "WorkflowArtifactRow",
    "WorkflowCheckpointRow",
    # auth
    "get_supabase",
    "get_service_supabase",
    "validate_supabase_user",
    "mask_login_identifier",
    # storage
    "SCREENSHOTS_BUCKET",
    "upload_screenshot",
    "make_screenshot_uploader",
    # platform
    "list_platform_accounts",
    "get_platform_account",
    "create_platform_account",
    "update_platform_account",
    "delete_platform_account",
    "list_binding_sessions",
    "get_binding_session",
    "create_binding_session",
    "update_binding_session",
    "attach_latest_binding_session",
    # tasks
    "get_tenant_settings",
    "update_tenant_settings",
    "create_candidates_batch",
    "create_automation_task",
    "update_automation_task",
    "complete_automation_task",
    "insert_task_log",
    # workflow
    "upsert_workflow_run",
    "get_workflow_run",
    "upsert_workflow_artifact",
    "list_workflow_artifacts",
    "get_workflow_artifact",
    "upsert_workflow_checkpoint",
    "list_workflow_checkpoints",
]
