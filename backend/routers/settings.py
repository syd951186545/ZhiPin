"""
OpenClaw 服务器配置 API

通过 OpenClaw Gateway 控制面读取和更新运行时配置。
配置文件位于 backend/openclaw 的持久化状态目录中，Gateway 的 config.apply 会直接持久化这些变更。
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.openclaw_gateway_config import service as gateway_config_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])


class OpenClawConfig(BaseModel):
    """前端可读的配置摘要（API Key 已脱敏）"""

    provider: str
    baseUrl: str
    model: str
    apiKeyMasked: str
    hasApiKey: bool


class UpdateOpenClawRequest(BaseModel):
    model: str
    apiKey: Optional[str] = None


class UpdateOpenClawResponse(BaseModel):
    success: bool
    message: str
    restarted: bool


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "***"
    return key[:8] + "***"


def _resolve_provider_config(config: dict, model: str) -> tuple[str, dict]:
    providers: dict = config.get("models", {}).get("providers", {})
    provider_from_model = model.split("/", 1)[0] if "/" in model else ""

    if provider_from_model and provider_from_model in providers:
        return provider_from_model, providers[provider_from_model]

    if providers:
        provider_name = next(iter(providers))
        return provider_name, providers[provider_name]

    return provider_from_model, {}


@router.get("/openclaw", response_model=OpenClawConfig)
async def get_openclaw_config():
    """读取当前 OpenClaw Gateway 运行时配置（API Key 脱敏返回）。"""

    cfg, _ = gateway_config_service.get_runtime_config()
    model = cfg.get("agents", {}).get("defaults", {}).get("model", {}).get("primary", "")
    provider_name, provider_cfg = _resolve_provider_config(cfg, model)
    api_key = provider_cfg.get("apiKey", "") if isinstance(provider_cfg, dict) else ""

    return OpenClawConfig(
        provider=provider_name,
        baseUrl=provider_cfg.get("baseUrl", "") if isinstance(provider_cfg, dict) else "",
        model=model,
        apiKeyMasked=_mask_key(api_key),
        hasApiKey=bool(api_key),
    )


@router.post("/openclaw", response_model=UpdateOpenClawResponse)
async def update_openclaw_config(req: UpdateOpenClawRequest):
    """通过 Gateway config.apply 更新 OpenClaw 配置。"""

    cfg, base_hash = gateway_config_service.get_runtime_config()
    providers: dict = cfg.setdefault("models", {}).setdefault("providers", {})
    provider_name = req.model.split("/", 1)[0] if "/" in req.model else ""

    if provider_name and provider_name not in providers:
        raise HTTPException(
            status_code=400,
            detail=f"当前 OpenClaw 配置中不存在 provider '{provider_name}'，请先在 openclaw.json 模板中定义该 provider。",
        )

    cfg.setdefault("agents", {}).setdefault("defaults", {}).setdefault("model", {})["primary"] = req.model
    model_catalog = cfg.setdefault("agents", {}).setdefault("defaults", {}).setdefault("models", {})
    model_catalog.setdefault(req.model, {"alias": req.model.split("/", 1)[-1]})

    agents_list: list = cfg.get("agents", {}).get("list", [])
    if agents_list:
        agents_list[0]["model"] = req.model

    if req.apiKey:
        target_provider = provider_name or next(iter(providers), None)
        if not target_provider:
            raise HTTPException(status_code=400, detail="当前 OpenClaw 配置未定义任何 provider，无法更新 API Key。")
        providers[target_provider]["apiKey"] = req.apiKey

    logger.info(
        "提交 OpenClaw Gateway 配置更新: model=%s, apiKey=%s",
        req.model,
        "已更新" if req.apiKey else "未变",
    )
    gateway_config_service.apply_runtime_config(cfg, base_hash)

    return UpdateOpenClawResponse(
        success=True,
        message="配置已提交到 OpenClaw Gateway，正在自动应用并重载服务。",
        restarted=True,
    )
