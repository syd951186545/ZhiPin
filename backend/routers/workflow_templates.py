"""
工作流模板接口。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from workflows.templates import list_workflow_templates, validate_workflow_template_config

router = APIRouter(prefix="/api/workflow-templates", tags=["workflow-templates"])


class WorkflowTemplateValidateRequest(BaseModel):
    workflow_id: str = Field(..., description="工作流模板 ID")
    payload: dict[str, Any] = Field(default_factory=dict, description="待校验的配置负载")


@router.get("")
async def get_workflow_templates():
    return {"items": list_workflow_templates()}


@router.post("/validate")
async def validate_workflow_template(req: WorkflowTemplateValidateRequest):
    return validate_workflow_template_config(req.workflow_id, req.payload)
