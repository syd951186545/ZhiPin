"""
工作流运行时快照与截图产物注册表。

当前实现为进程内存版，提供给 SSE 路由、artifact 查询接口和前端运行态详情页使用。
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

from services.supabase_client import (
    get_workflow_artifact,
    get_workflow_run,
    list_workflow_artifacts,
    list_workflow_checkpoints,
    upsert_workflow_artifact,
    upsert_workflow_checkpoint,
    upsert_workflow_run,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkflowRuntimeStore:
    def __init__(self) -> None:
        self._runs: dict[str, dict[str, Any]] = {}
        self._artifacts: dict[str, dict[str, Any]] = {}

    def init_run(
        self,
        execution_id: str,
        workflow_id: str,
        payload: Optional[dict[str, Any]] = None,
        *,
        tenant_id: Optional[str] = None,
        auth_token: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> None:
        sanitized_payload = deepcopy(payload or {})
        sanitized_payload.pop("supabase_auth_token", None)
        record = self._runs.get(execution_id, {})
        self._runs[execution_id] = {
            "execution_id": execution_id,
            "workflow_id": workflow_id,
            "status": record.get("status", "starting"),
            "multi_platform": record.get("multi_platform", len(sanitized_payload.get("platforms") or []) > 1),
            "created_at": record.get("created_at", _now_iso()),
            "updated_at": _now_iso(),
            "request": sanitized_payload or record.get("request") or {},
            "workflow_name": record.get("workflow_name"),
            "steps": record.get("steps", {}),
            "step_order": record.get("step_order", []),
            "accumulated_output": record.get("accumulated_output", ""),
            "artifacts": record.get("artifacts", []),
            "checkpoints": record.get("checkpoints", []),
            "latest_checkpoint": record.get("latest_checkpoint"),
            "current_platform": record.get("current_platform"),
            "error": record.get("error"),
            "error_code": record.get("error_code"),
            "result": record.get("result"),
            "events": record.get("events", []),
            "_tenant_id": tenant_id or record.get("_tenant_id"),
            "_auth_token": auth_token or record.get("_auth_token"),
            "_task_id": task_id or record.get("_task_id"),
        }
        self._persist_run(execution_id)

    def record_event(self, execution_id: str, event_type: str, data: dict[str, Any]) -> None:
        run = self._runs.setdefault(
            execution_id,
            {
                "execution_id": execution_id,
                "workflow_id": data.get("workflow_id"),
                "status": "running",
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
                "request": {},
                "workflow_name": None,
                "steps": {},
                "step_order": [],
                "multi_platform": False,
                "accumulated_output": "",
                "artifacts": [],
                "checkpoints": [],
                "latest_checkpoint": None,
                "current_platform": None,
                "error": None,
                "error_code": None,
                "result": None,
                "events": [],
            },
        )
        run["updated_at"] = _now_iso()
        run["events"] = (run.get("events") or [])[-199:] + [{"event": event_type, "data": deepcopy(data), "at": _now_iso()}]

        if event_type == "run_started":
            run["status"] = "running"
            run["workflow_id"] = data.get("workflow_id", run.get("workflow_id"))
            run["workflow_name"] = data.get("workflow_name", run.get("workflow_name"))
        elif event_type == "workflow_meta":
            run["workflow_id"] = data.get("workflow_id", run.get("workflow_id"))
            run["workflow_name"] = data.get("workflow_name", run.get("workflow_name"))
            run["multi_platform"] = data.get("multi_platform", run.get("multi_platform"))
            step_order: list[str] = []
            steps: dict[str, Any] = {}
            for step in data.get("steps", []) or []:
                step_id = step.get("id")
                if not step_id:
                    continue
                step_order.append(step_id)
                steps[step_id] = {
                    "id": step_id,
                    "name_zh": step.get("name_zh"),
                    "platform": step.get("platform"),
                    "requires_openclaw": step.get("requires_openclaw"),
                    "status": steps.get(step_id, {}).get("status", "pending"),
                    "error": steps.get(step_id, {}).get("error"),
                    "error_code": steps.get(step_id, {}).get("error_code"),
                    "attempt": steps.get(step_id, {}).get("attempt", 0),
                    "verified": steps.get(step_id, {}).get("verified"),
                }
            run["steps"] = steps
            run["step_order"] = step_order
        elif event_type == "step_change":
            step_id = data.get("step_id")
            if step_id:
                step = run["steps"].get(step_id, {"id": step_id})
                step.update(
                    {
                        "name_zh": data.get("step_name", step.get("name_zh")),
                        "status": data.get("status", step.get("status")),
                        "error": data.get("error", step.get("error")),
                        "error_code": data.get("error_code", step.get("error_code")),
                        "attempt": data.get("attempt", step.get("attempt", 0)),
                        "platform": data.get("platform", step.get("platform")),
                    }
                )
                run["steps"][step_id] = step
        elif event_type == "step_verified":
            step_id = data.get("step_id")
            if step_id:
                step = run["steps"].get(step_id, {"id": step_id})
                step.update(
                    {
                        "verified": data.get("verified"),
                        "attempt": data.get("attempt", step.get("attempt", 0)),
                        "error_code": data.get("error_code", step.get("error_code")),
                        "verification_message": data.get("message"),
                    }
                )
                run["steps"][step_id] = step
        elif event_type == "platform_change":
            run["current_platform"] = {
                "platform": data.get("platform"),
                "platform_name": data.get("platform_name"),
                "platform_index": data.get("platform_index"),
                "total_platforms": data.get("total_platforms"),
            }
        elif event_type == "progress":
            run["accumulated_output"] = (run.get("accumulated_output") or "") + (data.get("delta") or "")
        elif event_type == "artifact_created":
            artifact_id = data.get("artifact_id")
            if artifact_id:
                self._artifacts[artifact_id] = deepcopy(data)
                artifact_ids = run.get("artifacts") or []
                if artifact_id not in artifact_ids:
                    run["artifacts"] = artifact_ids + [artifact_id]
                self._persist_artifact(execution_id, artifact_id)
        elif event_type == "artifact_persisted":
            artifact_id = data.get("artifact_id")
            if artifact_id:
                artifact = self._artifacts.get(artifact_id, {})
                artifact.update(deepcopy(data))
                self._artifacts[artifact_id] = artifact
                self._persist_artifact(execution_id, artifact_id)
        elif event_type == "checkpoint_saved":
            run["latest_checkpoint"] = deepcopy(data)
            run["checkpoints"] = (run.get("checkpoints") or []) + [deepcopy(data)]
            self._persist_checkpoint(execution_id, data)
        elif event_type == "handoff_required":
            run["handoff_required"] = deepcopy(data)
        elif event_type == "complete":
            run["status"] = "completed"
            run["result"] = deepcopy(data)
        elif event_type == "run_completed":
            run["status"] = "completed"
        elif event_type == "run_failed":
            run["status"] = "failed"
            run["error"] = data.get("message")
            run["error_code"] = data.get("error_code")
        elif event_type == "error":
            run["status"] = "failed"
            run["error"] = data.get("message")
            run["error_code"] = data.get("error_code")
        elif event_type == "cancelled":
            run["status"] = "cancelled"
            run["error"] = data.get("message")

        self._persist_run(execution_id)

    def get_run(self, execution_id: str) -> Optional[dict[str, Any]]:
        run = self._runs.get(execution_id)
        if not run:
            return None
        hydrated = deepcopy(run)
        hydrated["artifacts_detail"] = [
            deepcopy(self._artifacts[artifact_id])
            for artifact_id in hydrated.get("artifacts", [])
            if artifact_id in self._artifacts
        ]
        for key in ("_tenant_id", "_auth_token", "_task_id"):
            hydrated.pop(key, None)
        return hydrated

    def list_run_artifacts(self, execution_id: str) -> list[dict[str, Any]]:
        run = self._runs.get(execution_id)
        if not run:
            return []
        return [
            deepcopy(self._artifacts[artifact_id])
            for artifact_id in run.get("artifacts", [])
            if artifact_id in self._artifacts
        ]

    def get_artifact(self, artifact_id: str) -> Optional[dict[str, Any]]:
        artifact = self._artifacts.get(artifact_id)
        return deepcopy(artifact) if artifact else None

    def hydrate_run_from_db(
        self,
        execution_id: str,
        *,
        tenant_id: str,
        auth_token: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        row = get_workflow_run(execution_id, tenant_id, auth_token=auth_token)
        if not row:
            return None

        artifacts = list_workflow_artifacts(execution_id, tenant_id, auth_token=auth_token)
        checkpoints = list_workflow_checkpoints(execution_id, tenant_id, auth_token=auth_token)
        run = {
            "execution_id": row.get("execution_id"),
            "workflow_id": row.get("workflow_id"),
            "status": row.get("status"),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
            "request": row.get("request_payload") or {},
            "workflow_name": row.get("workflow_name"),
            "steps": row.get("steps_payload") or {},
            "step_order": row.get("step_order") or [],
            "multi_platform": row.get("multi_platform", False),
            "accumulated_output": row.get("accumulated_output") or "",
            "artifacts": [item.get("artifact_id") for item in artifacts if item.get("artifact_id")],
            "checkpoints": checkpoints,
            "latest_checkpoint": row.get("latest_checkpoint"),
            "current_platform": row.get("current_platform"),
            "error": row.get("error_message"),
            "error_code": row.get("error_code"),
            "result": row.get("result_payload"),
            "events": row.get("events_payload") or [],
            "_tenant_id": tenant_id,
            "_auth_token": auth_token,
            "_task_id": row.get("task_id"),
        }
        self._runs[execution_id] = run
        for artifact in artifacts:
            artifact_id = artifact.get("artifact_id")
            if artifact_id:
                copied = deepcopy(artifact)
                copied["content_url"] = f"/api/artifacts/{artifact_id}/content"
                self._artifacts[artifact_id] = copied
        return self.get_run(execution_id)

    def hydrate_artifact_from_db(
        self,
        artifact_id: str,
        *,
        tenant_id: str,
        auth_token: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        artifact = get_workflow_artifact(artifact_id, tenant_id, auth_token=auth_token)
        if not artifact:
            return None
        copied = deepcopy(artifact)
        copied["content_url"] = f"/api/artifacts/{artifact_id}/content"
        self._artifacts[artifact_id] = copied
        return copied

    def _persist_run(self, execution_id: str) -> None:
        run = self._runs.get(execution_id)
        if not run:
            return
        tenant_id = run.get("_tenant_id")
        if not tenant_id:
            return
        try:
            status = run.get("status", "running")
            upsert_workflow_run(
                {
                    "execution_id": execution_id,
                    "tenant_id": tenant_id,
                    "workflow_id": run.get("workflow_id"),
                    "workflow_name": run.get("workflow_name"),
                    "status": status,
                    "multi_platform": bool(run.get("multi_platform")),
                    "request_payload": deepcopy(run.get("request") or {}),
                    "result_payload": deepcopy(run.get("result")),
                    "steps_payload": deepcopy(run.get("steps") or {}),
                    "step_order": deepcopy(run.get("step_order") or []),
                    "events_payload": deepcopy(run.get("events") or []),
                    "accumulated_output": run.get("accumulated_output") or "",
                    "current_platform": deepcopy(run.get("current_platform")),
                    "latest_checkpoint": deepcopy(run.get("latest_checkpoint")),
                    "handoff_required": deepcopy(run.get("handoff_required")),
                    "error_message": run.get("error"),
                    "error_code": run.get("error_code"),
                    "task_id": run.get("_task_id"),
                    "updated_at": _now_iso(),
                    "completed_at": _now_iso() if status in {"completed", "failed", "cancelled"} else None,
                },
                auth_token=run.get("_auth_token"),
            )
        except Exception:
            # 持久化失败不阻断工作流主链路
            return

    def _persist_artifact(self, execution_id: str, artifact_id: str) -> None:
        run = self._runs.get(execution_id)
        artifact = self._artifacts.get(artifact_id)
        if not run or not artifact:
            return
        tenant_id = run.get("_tenant_id")
        if not tenant_id:
            return
        try:
            upsert_workflow_artifact(
                {
                    "artifact_id": artifact_id,
                    "execution_id": execution_id,
                    "tenant_id": tenant_id,
                    "step_id": artifact.get("step_id"),
                    "artifact_type": artifact.get("artifact_type", "screenshot"),
                    "source": artifact.get("source", "openclaw_browser"),
                    "capture_phase": artifact.get("capture_phase", "after_action"),
                    "mime_type": artifact.get("mime_type", "image/png"),
                    "storage_key": artifact.get("storage_key"),
                    "preview_url": artifact.get("preview_url"),
                    "live_url": artifact.get("live_url"),
                    "signed_url": artifact.get("signed_url"),
                    "width": artifact.get("width"),
                    "height": artifact.get("height"),
                    "captured_at": artifact.get("captured_at"),
                    "updated_at": _now_iso(),
                },
                auth_token=run.get("_auth_token"),
            )
        except Exception:
            return

    def _persist_checkpoint(self, execution_id: str, checkpoint: dict[str, Any]) -> None:
        run = self._runs.get(execution_id)
        if not run:
            return
        tenant_id = run.get("_tenant_id")
        if not tenant_id:
            return
        try:
            upsert_workflow_checkpoint(
                {
                    "checkpoint_id": checkpoint.get("checkpoint_id"),
                    "execution_id": execution_id,
                    "tenant_id": tenant_id,
                    "step_id": checkpoint.get("step_id"),
                    "step_name": checkpoint.get("step_name"),
                    "step_index": checkpoint.get("step_index", 0),
                    "attempt": checkpoint.get("attempt", 1),
                    "artifact_ids": checkpoint.get("artifact_ids", []),
                    "payload": deepcopy(checkpoint),
                    "verified_at": checkpoint.get("verified_at"),
                },
                auth_token=run.get("_auth_token"),
            )
        except Exception:
            return


store = WorkflowRuntimeStore()
