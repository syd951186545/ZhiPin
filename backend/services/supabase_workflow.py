"""
Supabase 工作流运行时持久化

提供：
  - upsert/get_workflow_run
  - upsert/list/get_workflow_artifact
  - upsert/list_workflow_checkpoint
"""

from typing import Any, Optional

from services.supabase_auth import get_supabase
from services.supabase_types import WorkflowArtifactRow, WorkflowCheckpointRow, WorkflowRunRow


# ── Workflow Runs ──────────────────────────────────────────


def upsert_workflow_run(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> WorkflowRunRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_runs")
        .upsert(row, on_conflict="execution_id")
        .execute()
    )
    return (result.data or [{}])[0]


def get_workflow_run(
    execution_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> Optional[WorkflowRunRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_runs")
        .select("*")
        .eq("execution_id", execution_id)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


# ── Workflow Artifacts ─────────────────────────────────────


def upsert_workflow_artifact(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> WorkflowArtifactRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_artifacts")
        .upsert(row, on_conflict="artifact_id")
        .execute()
    )
    return (result.data or [{}])[0]


def list_workflow_artifacts(
    execution_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> list[WorkflowArtifactRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_artifacts")
        .select("*")
        .eq("execution_id", execution_id)
        .eq("tenant_id", tenant_id)
        .order("captured_at", desc=False)
        .execute()
    )
    return result.data or []


def get_workflow_artifact(
    artifact_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> Optional[WorkflowArtifactRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_artifacts")
        .select("*")
        .eq("artifact_id", artifact_id)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


# ── Workflow Checkpoints ───────────────────────────────────


def upsert_workflow_checkpoint(
    row: dict[str, Any],
    auth_token: Optional[str] = None,
) -> WorkflowCheckpointRow:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_checkpoints")
        .upsert(row, on_conflict="checkpoint_id")
        .execute()
    )
    return (result.data or [{}])[0]


def list_workflow_checkpoints(
    execution_id: str,
    tenant_id: str,
    auth_token: Optional[str] = None,
) -> list[WorkflowCheckpointRow]:
    sb = get_supabase(auth_token)
    result = (
        sb.table("workflow_checkpoints")
        .select("*")
        .eq("execution_id", execution_id)
        .eq("tenant_id", tenant_id)
        .order("verified_at", desc=False)
        .execute()
    )
    return result.data or []
