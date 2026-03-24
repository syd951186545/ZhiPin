"""
工作流运行态与截图产物查询接口。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from services.workflow_runtime_store import store as runtime_store
from services.supabase_client import validate_supabase_user

router = APIRouter(prefix="/api", tags=["workflow-runtime"])


async def _resolve_auth(headers) -> tuple[None | str, None | str]:
    authorization = headers.get("authorization") or ""
    if not authorization.lower().startswith("bearer "):
        return None, None
    auth_token = authorization.split(" ", 1)[1].strip()
    if not auth_token:
        return None, None
    validated = await validate_supabase_user(auth_token)
    return validated["tenant_id"], auth_token


@router.get("/workflow-runs/{execution_id}")
async def get_workflow_run(execution_id: str, request: Request):
    run = runtime_store.get_run(execution_id)
    if not run:
        tenant_id, auth_token = await _resolve_auth(request.headers)
        if tenant_id:
            run = runtime_store.hydrate_run_from_db(execution_id, tenant_id=tenant_id, auth_token=auth_token)
    if not run:
        raise HTTPException(status_code=404, detail="工作流运行不存在")
    return run


@router.get("/workflow-runs/{execution_id}/artifacts")
async def list_workflow_run_artifacts(execution_id: str, request: Request):
    artifacts = runtime_store.list_run_artifacts(execution_id)
    if not artifacts and runtime_store.get_run(execution_id) is None:
        tenant_id, auth_token = await _resolve_auth(request.headers)
        if tenant_id:
            runtime_store.hydrate_run_from_db(execution_id, tenant_id=tenant_id, auth_token=auth_token)
            artifacts = runtime_store.list_run_artifacts(execution_id)
    if not artifacts and runtime_store.get_run(execution_id) is None:
        raise HTTPException(status_code=404, detail="工作流运行不存在")
    return {"items": artifacts}


@router.get("/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str, request: Request):
    artifact = runtime_store.get_artifact(artifact_id)
    if not artifact:
        tenant_id, auth_token = await _resolve_auth(request.headers)
        if tenant_id:
            artifact = runtime_store.hydrate_artifact_from_db(artifact_id, tenant_id=tenant_id, auth_token=auth_token)
    if not artifact:
        raise HTTPException(status_code=404, detail="截图产物不存在")
    return artifact


@router.get("/artifacts/{artifact_id}/content")
async def get_artifact_content(artifact_id: str, request: Request):
    artifact = runtime_store.get_artifact(artifact_id)
    if not artifact:
        tenant_id, auth_token = await _resolve_auth(request.headers)
        if tenant_id:
            artifact = runtime_store.hydrate_artifact_from_db(artifact_id, tenant_id=tenant_id, auth_token=auth_token)
    if not artifact:
        raise HTTPException(status_code=404, detail="截图产物不存在")

    target = artifact.get("preview_url") or artifact.get("live_url") or artifact.get("signed_url")
    if not target:
        raise HTTPException(status_code=404, detail="截图产物尚无可访问内容")

    return RedirectResponse(url=target, status_code=307)
