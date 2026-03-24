"""
工作流模板注册表。

目标：
- 让前端以声明式方式读取当前支持的 workflow 模板
- 在启动前使用同一份模板规则做配置校验
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from workflows.base import StepDefinition
from workflows.publish_job import STEPS as PUBLISH_JOB_STEPS
from workflows.resume_screen import PER_PLATFORM_STEPS
from workflows.talent_explore import STEPS as TALENT_EXPLORE_STEPS


@dataclass(frozen=True)
class WorkflowTemplateField:
    key: str
    label: str
    description: str
    required: bool = True
    scope: str = "workflow"
    field_type: str = "string"

    def to_payload(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "description": self.description,
            "required": self.required,
            "scope": self.scope,
            "field_type": self.field_type,
        }


@dataclass(frozen=True)
class WorkflowTemplateStep:
    id: str
    name_zh: str
    requires_openclaw: bool
    retry_max_attempts: int
    screenshot_policy: str
    escalation_policy: str
    template_id: str | None = None
    platform_scoped: bool = False

    def to_payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name_zh": self.name_zh,
            "requires_openclaw": self.requires_openclaw,
            "retry_max_attempts": self.retry_max_attempts,
            "screenshot_policy": self.screenshot_policy,
            "escalation_policy": self.escalation_policy,
            "template_id": self.template_id,
            "platform_scoped": self.platform_scoped,
        }


@dataclass(frozen=True)
class WorkflowTemplate:
    id: str
    title: str
    description: str
    multi_platform: bool
    execution_mode: str = "auto_submit"
    screenshot_mode: str = "direct_url"
    handoff_triggers: list[str] = field(default_factory=list)
    required_fields: list[WorkflowTemplateField] = field(default_factory=list)
    steps: list[WorkflowTemplateStep] = field(default_factory=list)

    def to_payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "multi_platform": self.multi_platform,
            "execution_mode": self.execution_mode,
            "screenshot_mode": self.screenshot_mode,
            "handoff_triggers": self.handoff_triggers,
            "required_fields": [field.to_payload() for field in self.required_fields],
            "steps": [step.to_payload() for step in self.steps],
        }


def _step_to_template(step: StepDefinition, *, platform_scoped: bool = False) -> WorkflowTemplateStep:
    return WorkflowTemplateStep(
        id=step.id,
        name_zh=step.name_zh,
        requires_openclaw=step.requires_openclaw,
        retry_max_attempts=step.retry_policy.max_attempts,
        screenshot_policy=step.screenshot_policy,
        escalation_policy=step.escalation_policy,
        template_id=step.template_id,
        platform_scoped=platform_scoped,
    )


TEMPLATES: dict[str, WorkflowTemplate] = {
    "publish_job": WorkflowTemplate(
        id="publish_job",
        title="发布招聘公告",
        description="复用已绑定账号，自动填写岗位信息并发布到招聘平台。",
        multi_platform=False,
        handoff_triggers=["captcha", "anti_bot", "auth_required", "verifier_failed"],
        required_fields=[
            WorkflowTemplateField("platform", "执行平台", "选择一个招聘平台。"),
            WorkflowTemplateField("account_id", "执行账号", "选择一个已绑定且有效的平台账号。"),
            WorkflowTemplateField("job_id", "招聘岗位", "选择一个岗位作为公告发布内容来源。"),
            WorkflowTemplateField("company_name", "企业名称", "用于生成公告与发布页展示。"),
        ],
        steps=[_step_to_template(step) for step in PUBLISH_JOB_STEPS],
    ),
    "talent_explore": WorkflowTemplate(
        id="talent_explore",
        title="市场人才探索",
        description="进入人才库主动搜索、筛选并沟通匹配候选人。",
        multi_platform=False,
        handoff_triggers=["captcha", "anti_bot", "auth_required"],
        required_fields=[
            WorkflowTemplateField("platform", "执行平台", "选择一个招聘平台。"),
            WorkflowTemplateField("account_id", "执行账号", "选择一个已绑定且有效的平台账号。"),
            WorkflowTemplateField("job_id", "招聘岗位", "选择一个岗位作为搜索条件来源。"),
            WorkflowTemplateField("min_match_score", "筛选阈值", "用于筛选高匹配候选人。", field_type="number"),
        ],
        steps=[_step_to_template(step) for step in TALENT_EXPLORE_STEPS],
    ),
    "resume_screen": WorkflowTemplate(
        id="resume_screen",
        title="简历筛选及AI沟通",
        description="多平台依次复用默认账号，AI 自动筛选简历并沟通。",
        multi_platform=True,
        handoff_triggers=["captcha", "anti_bot", "auth_required"],
        required_fields=[
            WorkflowTemplateField("platforms", "执行平台集合", "选择至少一个招聘平台。", field_type="string[]"),
            WorkflowTemplateField("platform_account_ids", "平台账号映射", "为每个平台配置一个默认执行账号。", field_type="record"),
            WorkflowTemplateField("job_id", "招聘岗位", "选择一个岗位作为筛选标准。"),
            WorkflowTemplateField("min_match_score", "筛选阈值", "用于筛选高匹配候选人。", field_type="number"),
        ],
        steps=[
            *[_step_to_template(step, platform_scoped=True) for step in PER_PLATFORM_STEPS],
            WorkflowTemplateStep(
                id="save_results",
                name_zh="汇总保存结果",
                requires_openclaw=False,
                retry_max_attempts=1,
                screenshot_policy="after_action",
                escalation_policy="none",
            ),
        ],
    ),
}


def list_workflow_templates() -> list[dict[str, Any]]:
    return [template.to_payload() for template in TEMPLATES.values()]


def get_workflow_template(workflow_id: str) -> WorkflowTemplate | None:
    return TEMPLATES.get(workflow_id)


def validate_workflow_template_config(workflow_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    template = get_workflow_template(workflow_id)
    if not template:
        return {
            "valid": False,
            "errors": [f"未知工作流模板: {workflow_id}"],
            "normalized": {},
            "template": None,
        }

    errors: list[str] = []
    normalized = dict(payload)

    def _is_empty(value: Any) -> bool:
        if value is None:
            return True
        if isinstance(value, str):
            return value.strip() == ""
        if isinstance(value, (list, dict)):
            return len(value) == 0
        return False

    for field_def in template.required_fields:
        value = normalized.get(field_def.key)
        if field_def.required and _is_empty(value):
            errors.append(f"{field_def.label}未配置，请先完成配置。")

    if template.multi_platform:
        platforms = normalized.get("platforms") or []
        if not isinstance(platforms, list) or not platforms:
            errors.append("请至少选择一个执行平台。")
        account_map = normalized.get("platform_account_ids") or {}
        if isinstance(platforms, list) and isinstance(account_map, dict):
            for platform in platforms:
                if not account_map.get(platform):
                    errors.append(f"平台 {platform} 未配置默认执行账号。")
    else:
        if _is_empty(normalized.get("platform")):
            errors.append("执行平台未配置，请先选择平台。")
        if _is_empty(normalized.get("account_id")):
            errors.append("执行账号未配置，请先选择账号。")

    if _is_empty(normalized.get("job_id")):
        errors.append("招聘岗位未配置，请先选择岗位。")

    min_match_score = normalized.get("min_match_score")
    if min_match_score is not None:
        try:
            score = int(min_match_score)
        except (TypeError, ValueError):
            errors.append("筛选阈值必须是数字。")
        else:
            if score < 0 or score > 100:
                errors.append("筛选阈值必须在 0 到 100 之间。")
            normalized["min_match_score"] = score

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "normalized": normalized,
        "template": template.to_payload(),
    }
