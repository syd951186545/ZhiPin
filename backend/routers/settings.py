"""
OpenClaw 服务器配置 API

按租户读取/保存 AI 模型与 API Key，并通过 OpenClaw Gateway 应用运行时配置。
"""

from __future__ import annotations

import logging
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from config import get_settings
from services.openclaw_gateway_config import service as gateway_config_service
from services.supabase_client import get_tenant_settings, update_tenant_settings, validate_supabase_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

OFFICIAL_OPENCLAW_MODEL_CATALOG: list[dict[str, Any]] = [
    {
        "provider": "anthropic",
        "models": [
            {"value": "anthropic/claude-opus-4-6", "label": "Claude Opus 4.6"},
        ],
    },
    {
        "provider": "byteplus",
        "models": [
            {"value": "byteplus/seed-1-8-251228", "label": "Seed 1.8"},
            {"value": "byteplus/kimi-k2-5-260127", "label": "Kimi K2.5"},
            {"value": "byteplus/glm-4-7-251222", "label": "GLM 4.7"},
        ],
    },
    {
        "provider": "byteplus-plan",
        "models": [
            {"value": "byteplus-plan/ark-code-latest", "label": "ARK Code Latest"},
            {"value": "byteplus-plan/doubao-seed-code", "label": "Doubao Seed Code"},
            {"value": "byteplus-plan/kimi-k2.5", "label": "Kimi K2.5"},
            {"value": "byteplus-plan/kimi-k2-thinking", "label": "Kimi K2 Thinking"},
            {"value": "byteplus-plan/glm-4.7", "label": "GLM 4.7"},
        ],
    },
    {
        "provider": "google",
        "models": [
            {"value": "google/gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro Preview"},
            {"value": "google/gemini-3-flash-preview", "label": "Gemini 3 Flash Preview"},
        ],
    },
    {
        "provider": "huggingface",
        "models": [
            {"value": "huggingface/deepseek-ai/DeepSeek-R1", "label": "DeepSeek R1"},
        ],
    },
    {
        "provider": "kilocode",
        "models": [
            {"value": "kilocode/anthropic/claude-opus-4.6", "label": "Claude Opus 4.6"},
            {"value": "kilocode/glm-5-free", "label": "GLM-5 Free"},
            {"value": "kilocode/minimax-m2.5-free", "label": "MiniMax M2.5 Free"},
            {"value": "kilocode/gpt-5.2", "label": "GPT-5.2"},
            {"value": "kilocode/gemini-3-pro-preview", "label": "Gemini 3 Pro Preview"},
            {"value": "kilocode/gemini-3-flash-preview", "label": "Gemini 3 Flash Preview"},
            {"value": "kilocode/grok-code-fast-1", "label": "Grok Code Fast 1"},
            {"value": "kilocode/kimi-k2.5", "label": "Kimi K2.5"},
        ],
    },
    {
        "provider": "kimi-coding",
        "models": [
            {"value": "kimi-coding/k2p5", "label": "K2.5"},
        ],
    },
    {
        "provider": "minimax-cn",
        "models": [
            {"value": "minimax-cn/MiniMax-M2.5", "label": "MiniMax M2.5"},
            {"value": "minimax-cn/MiniMax-M2.5-highspeed", "label": "MiniMax M2.5 Highspeed"},
        ],
    },
    {
        "provider": "minimax",
        "models": [
            {"value": "minimax/MiniMax-M2.5", "label": "MiniMax M2.5"},
            {"value": "minimax/MiniMax-M2.5-highspeed", "label": "MiniMax M2.5 Highspeed"},
        ],
    },
    {
        "provider": "mistral",
        "models": [
            {"value": "mistral/mistral-large-latest", "label": "Mistral Large Latest"},
        ],
    },
    {
        "provider": "moonshot",
        "models": [
            {"value": "moonshot/kimi-k2.5", "label": "Kimi K2.5"},
            {"value": "moonshot/kimi-k2-0905-preview", "label": "Kimi K2 0905 Preview"},
            {"value": "moonshot/kimi-k2-turbo-preview", "label": "Kimi K2 Turbo Preview"},
            {"value": "moonshot/kimi-k2-thinking", "label": "Kimi K2 Thinking"},
            {"value": "moonshot/kimi-k2-thinking-turbo", "label": "Kimi K2 Thinking Turbo"},
        ],
    },
    {
        "provider": "ollama",
        "models": [
            {"value": "ollama/llama3.3", "label": "Llama 3.3"},
            {"value": "ollama/deepseek-r1:32b", "label": "DeepSeek R1 32B"},
            {"value": "ollama/qwen2.5-coder:32b", "label": "Qwen2.5 Coder 32B"},
        ],
    },
    {
        "provider": "opencode",
        "models": [
            {"value": "opencode/claude-opus-4-6", "label": "Claude Opus 4.6"},
            {"value": "opencode/gpt-5.2", "label": "GPT-5.2"},
            {"value": "opencode/gemini-3-pro", "label": "Gemini 3 Pro"},
        ],
    },
    {
        "provider": "opencode-go",
        "models": [
            {"value": "opencode-go/kimi-k2.5", "label": "Kimi K2.5"},
            {"value": "opencode-go/glm-5", "label": "GLM-5"},
            {"value": "opencode-go/minimax-m2.5", "label": "MiniMax M2.5"},
        ],
    },
    {
        "provider": "openai",
        "models": [
            {"value": "openai/gpt-5.4", "label": "GPT-5.4"},
            {"value": "openai/gpt-5.4-pro", "label": "GPT-5.4 Pro"},
        ],
    },
    {
        "provider": "openai-codex",
        "models": [
            {"value": "openai-codex/gpt-5.4", "label": "GPT-5.4"},
            {"value": "openai-codex/gpt-5.3-codex-spark", "label": "GPT-5.3 Codex Spark"},
        ],
    },
    {
        "provider": "openrouter",
        "models": [
            {"value": "openrouter/anthropic/claude-sonnet-4-5", "label": "Claude Sonnet 4.5"},
        ],
    },
    {
        "provider": "qwen-portal",
        "models": [
            {"value": "qwen-portal/coder-model", "label": "Coder Model"},
            {"value": "qwen-portal/vision-model", "label": "Vision Model"},
        ],
    },
    {
        "provider": "synthetic",
        "models": [
            {"value": "synthetic/hf:MiniMaxAI/MiniMax-M2.5", "label": "MiniMax M2.5"},
        ],
    },
    {
        "provider": "vercel-ai-gateway",
        "models": [
            {"value": "vercel-ai-gateway/anthropic/claude-opus-4.6", "label": "Claude Opus 4.6"},
        ],
    },
    {
        "provider": "volcengine",
        "models": [
            {"value": "volcengine/doubao-seed-1-8-251228", "label": "Doubao Seed 1.8"},
            {"value": "volcengine/doubao-seed-code-preview-251028", "label": "Doubao Seed Code Preview"},
            {"value": "volcengine/kimi-k2-5-260127", "label": "Kimi K2.5"},
            {"value": "volcengine/glm-4-7-251222", "label": "GLM 4.7"},
            {"value": "volcengine/deepseek-v3-2-251201", "label": "DeepSeek V3.2 128K"},
        ],
    },
    {
        "provider": "volcengine-plan",
        "models": [
            {"value": "volcengine-plan/ark-code-latest", "label": "ARK Code Latest"},
            {"value": "volcengine-plan/doubao-seed-code", "label": "Doubao Seed Code"},
            {"value": "volcengine-plan/kimi-k2.5", "label": "Kimi K2.5"},
            {"value": "volcengine-plan/kimi-k2-thinking", "label": "Kimi K2 Thinking"},
            {"value": "volcengine-plan/glm-4.7", "label": "GLM 4.7"},
        ],
    },
    {
        "provider": "zai",
        "models": [
            {"value": "zai/glm-5", "label": "GLM-5"},
            {"value": "zai/glm-4.7", "label": "GLM-4.7"},
            {"value": "zai/glm-4.6", "label": "GLM-4.6"},
        ],
    },
]


class OpenClawConfig(BaseModel):
    provider: str
    baseUrl: str
    model: str
    apiKeyMasked: str
    hasApiKey: bool
    hasStoredApiKey: bool
    availableModels: list[dict]
    validationStatus: str
    validationMessage: str
    validatedAt: Optional[str] = None
    gatewayAvailable: bool = True


class UpdateOpenClawRequest(BaseModel):
    model: str
    apiKey: Optional[str] = None


class UpdateOpenClawResponse(BaseModel):
    success: bool
    message: str
    restarted: bool
    validationStatus: str
    validationMessage: str
    validatedAt: Optional[str] = None
    apiKeyMasked: str


def _read_bearer(authorization: Optional[str]) -> str:
    if not authorization:
        return ""
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip()


async def _validate_request_user(auth_token: str) -> dict[str, Any]:
    if not auth_token:
        raise HTTPException(status_code=401, detail="缺少 Supabase 用户令牌")
    try:
        return await validate_supabase_user(auth_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


def _mask_key(key: str) -> str:
    value = (key or "").strip()
    if not value:
        return ""
    if len(value) <= 8:
        return value[:2] + "*" * max(len(value) - 2, 1)
    return f"{value[:4]}{'*' * 8}{value[-4:]}"


def _resolve_provider_config(config: dict[str, Any], model: str) -> tuple[str, dict[str, Any]]:
    providers: dict[str, Any] = config.get("models", {}).get("providers", {})
    provider_from_model = model.split("/", 1)[0] if "/" in model else ""

    if provider_from_model and provider_from_model in providers:
        provider_cfg = providers.get(provider_from_model)
        return provider_from_model, provider_cfg if isinstance(provider_cfg, dict) else {}

    if providers:
        provider_name = next(iter(providers))
        provider_cfg = providers.get(provider_name)
        return provider_name, provider_cfg if isinstance(provider_cfg, dict) else {}

    return provider_from_model, {}


def _append_model_option(
    grouped: dict[str, dict[str, str]],
    provider: str,
    model_value: str,
    alias: str | None = None,
) -> None:
    value = (model_value or "").strip()
    if not value:
        return

    normalized_provider = (provider or "").strip() or (value.split("/", 1)[0] if "/" in value else "other")
    grouped.setdefault(normalized_provider, {})
    grouped[normalized_provider][value] = alias or value.split("/", 1)[-1]


def _extract_available_models(config: dict[str, Any], current_model: str) -> list[dict]:
    grouped: dict[str, dict[str, str]] = {}
    providers: dict[str, Any] = config.get("models", {}).get("providers", {})
    catalog: dict[str, Any] = config.get("agents", {}).get("defaults", {}).get("models", {})

    for provider_group in OFFICIAL_OPENCLAW_MODEL_CATALOG:
        provider = str(provider_group.get("provider") or "").strip()
        for item in provider_group.get("models", []):
            if not isinstance(item, dict):
                continue
            _append_model_option(grouped, provider, str(item.get("value") or ""), str(item.get("label") or ""))

    for model_value, meta in catalog.items():
        if not isinstance(model_value, str):
            continue
        alias = meta.get("alias") if isinstance(meta, dict) else None
        provider = model_value.split("/", 1)[0] if "/" in model_value else ""
        if not provider and isinstance(meta, dict):
            provider = str(meta.get("provider") or meta.get("providerId") or "").strip()
        _append_model_option(grouped, provider, model_value, alias)

    for provider_name, provider_cfg in providers.items():
        if not isinstance(provider_cfg, dict):
            continue
        configured_models = provider_cfg.get("models")
        if isinstance(configured_models, list):
            for item in configured_models:
                if isinstance(item, str):
                    model_value = item if "/" in item else f"{provider_name}/{item}"
                    _append_model_option(grouped, provider_name, model_value, item.split("/", 1)[-1])
                elif isinstance(item, dict):
                    raw_value = str(item.get("id") or item.get("name") or item.get("model") or "").strip()
                    alias = str(item.get("alias") or item.get("label") or raw_value.split("/", 1)[-1]).strip()
                    if raw_value:
                        model_value = raw_value if "/" in raw_value else f"{provider_name}/{raw_value}"
                        _append_model_option(grouped, provider_name, model_value, alias)
        elif isinstance(configured_models, dict):
            for raw_value, meta in configured_models.items():
                if not isinstance(raw_value, str):
                    continue
                alias = meta.get("alias") if isinstance(meta, dict) else None
                model_value = raw_value if "/" in raw_value else f"{provider_name}/{raw_value}"
                _append_model_option(grouped, provider_name, model_value, alias)

    _append_model_option(grouped, "", current_model, current_model.split("/", 1)[-1] if current_model else None)

    return [
        {
            "provider": provider,
            "models": [
                {"value": model_value, "label": label}
                for model_value, label in sorted(models.items(), key=lambda item: item[1].lower())
            ],
        }
        for provider, models in sorted(grouped.items(), key=lambda item: item[0].lower())
    ]


def _sync_runtime_model(config: dict[str, Any], model: str) -> None:
    config.setdefault("agents", {}).setdefault("defaults", {}).setdefault("model", {})["primary"] = model
    model_catalog = config.setdefault("agents", {}).setdefault("defaults", {}).setdefault("models", {})
    model_catalog.setdefault(model, {"alias": model.split("/", 1)[-1]})

    agents_list: list[dict[str, Any]] = config.get("agents", {}).get("list", [])
    for agent in agents_list:
        if isinstance(agent, dict):
            agent["model"] = model


async def _validate_openclaw_runtime() -> tuple[str, str]:
    settings = get_settings()
    payload = {
        "model": "openclaw",
        "input": "请只回复 OK，用于验证当前模型与 API Key 配置是否可用。",
        "stream": False,
        "max_output_tokens": 16,
    }
    headers = {
        "Authorization": f"Bearer {settings.openclaw_auth_token}",
        "Content-Type": "application/json",
        "x-openclaw-agent-id": settings.openclaw_agent_id,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(f"{settings.openclaw_base_url.rstrip('/')}/v1/responses", headers=headers, json=payload)
            resp.raise_for_status()
            return "success", "模型与 API Key 验证成功，OpenClaw 已可正常调用。"
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip() or f"HTTP {exc.response.status_code}"
        return "error", f"模型验证失败：{detail[:300]}"
    except Exception as exc:
        return "error", f"模型验证失败：{str(exc)[:300]}"


def _resolve_effective_api_key(
    req: UpdateOpenClawRequest,
    stored_model: str,
    stored_api_key: str,
    runtime_provider_cfg: dict[str, Any],
    target_provider_cfg: dict[str, Any],
) -> str:
    new_key = (req.apiKey or "").strip()
    if new_key:
        return new_key

    target_provider = req.model.split("/", 1)[0] if "/" in req.model else ""
    stored_provider = stored_model.split("/", 1)[0] if "/" in stored_model else ""

    if stored_api_key and (not target_provider or target_provider == stored_provider):
        return stored_api_key

    runtime_key = ""
    if isinstance(target_provider_cfg, dict):
        runtime_key = str(target_provider_cfg.get("apiKey") or "").strip()
    if not runtime_key and isinstance(runtime_provider_cfg, dict):
        runtime_key = str(runtime_provider_cfg.get("apiKey") or "").strip()
    if runtime_key:
        return runtime_key

    raise HTTPException(status_code=400, detail="切换到新的模型提供商时必须重新填写对应的 API Key。")


@router.get("/openclaw", response_model=OpenClawConfig)
async def get_openclaw_config(
    authorization: Optional[str] = Header(default=None),
):
    auth_token = _read_bearer(authorization)
    user = await _validate_request_user(auth_token)
    settings = get_settings()

    tenant_settings = get_tenant_settings(user["tenant_id"], auth_token=auth_token)
    if not tenant_settings:
        raise HTTPException(status_code=404, detail="未找到当前租户的系统设置记录")

    db_validation_status = str(tenant_settings.get("ai_validation_status") or "unknown")
    database_model = str(tenant_settings.get("ai_model") or "").strip()
    database_api_key = str(tenant_settings.get("ai_api_key") or "").strip()

    # ── 已配置过：直接使用数据库中上一次成功生效的配置，不再查询 Gateway ──
    if db_validation_status == "success":
        model = database_model
        provider_name = model.split("/", 1)[0] if "/" in model else ""
        if database_api_key:
            # 用户手动配置并保存过真实 Key
            api_key_masked = _mask_key(database_api_key)
        else:
            # 使用的是 OpenClaw 系统内置 Key（保存时 key 为 null 表示沿用系统默认）
            api_key_masked = "系统默认 API Key，已配置生效"
        return OpenClawConfig(
            provider=provider_name,
            baseUrl=settings.openclaw_base_url,
            model=model,
            apiKeyMasked=api_key_masked,
            hasApiKey=True,
            hasStoredApiKey=True,
            availableModels=_extract_available_models({}, model),
            validationStatus=db_validation_status,
            validationMessage=str(tenant_settings.get("ai_validation_message") or ""),
            validatedAt=tenant_settings.get("ai_validated_at"),
            gatewayAvailable=True,
        )

    # ── 首次使用：从 Gateway 读取当前配置作为初始值 ──
    try:
        cfg, _ = gateway_config_service.get_runtime_config()
        runtime_model = cfg.get("agents", {}).get("defaults", {}).get("model", {}).get("primary", "")
        provider_name, provider_cfg = _resolve_provider_config(cfg, runtime_model)
        raw_api_key = str(provider_cfg.get("apiKey") or "").strip() if isinstance(provider_cfg, dict) else ""
    except HTTPException as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "首次配置需要从 OpenClaw Gateway 读取当前模型信息，但 Gateway 当前不可用。"
                "请确保 OpenClaw Gateway 正常运行后刷新此页面。"
                f"Gateway 错误：{exc.detail}"
            ),
        ) from exc

    model = runtime_model
    if not provider_name:
        provider_name = model.split("/", 1)[0] if "/" in model else ""

    if raw_api_key == "__OPENCLAW_REDACTED__":
        # OpenClaw 系统内置 Key，已生效但接口中不可读取
        api_key_masked = "系统默认 API Key，已配置生效"
        has_api_key = True
    elif raw_api_key:
        api_key_masked = _mask_key(raw_api_key)
        has_api_key = True
    else:
        api_key_masked = ""
        has_api_key = False

    return OpenClawConfig(
        provider=provider_name,
        baseUrl=str(provider_cfg.get("baseUrl") or settings.openclaw_base_url or "") if isinstance(provider_cfg, dict) else settings.openclaw_base_url,
        model=model,
        apiKeyMasked=api_key_masked,
        hasApiKey=has_api_key,
        hasStoredApiKey=has_api_key,
        availableModels=_extract_available_models(cfg, model),
        validationStatus=db_validation_status,
        validationMessage=str(tenant_settings.get("ai_validation_message") or ""),
        validatedAt=tenant_settings.get("ai_validated_at"),
        gatewayAvailable=True,
    )


@router.post("/openclaw", response_model=UpdateOpenClawResponse)
async def update_openclaw_config(
    req: UpdateOpenClawRequest,
    authorization: Optional[str] = Header(default=None),
):
    auth_token = _read_bearer(authorization)
    user = await _validate_request_user(auth_token)

    tenant_settings = get_tenant_settings(user["tenant_id"], auth_token=auth_token)
    if not tenant_settings:
        raise HTTPException(status_code=404, detail="未找到当前租户的系统设置记录")

    try:
        cfg, base_hash = gateway_config_service.get_runtime_config()
    except HTTPException as exc:
        raise HTTPException(
            status_code=503,
            detail=f"OpenClaw Gateway 配置接口当前不可用，无法更新模型配置。请先在 OpenClaw 配置中放开 gateway.tools.allow 的 gateway，并启用 responses endpoint。原始错误：{exc.detail}",
        ) from exc

    gateway_config_service.apply_management_api_defaults(cfg)
    original_cfg = deepcopy(cfg)
    providers: dict[str, Any] = cfg.setdefault("models", {}).setdefault("providers", {})
    if not providers:
        raise HTTPException(status_code=400, detail="当前 OpenClaw 配置未定义任何 provider，无法更新模型配置。")

    runtime_model = cfg.get("agents", {}).get("defaults", {}).get("model", {}).get("primary", "")
    stored_model = str(tenant_settings.get("ai_model") or runtime_model or "").strip()
    runtime_provider_name, runtime_provider_cfg = _resolve_provider_config(cfg, stored_model)

    target_provider = req.model.split("/", 1)[0] if "/" in req.model else ""
    if target_provider and target_provider not in providers:
        raise HTTPException(
            status_code=400,
            detail=f"当前 OpenClaw 配置中不存在 provider '{target_provider}'，请先在 Gateway 模板中定义该 provider。",
        )

    provider_name, provider_cfg = _resolve_provider_config(cfg, req.model)
    effective_api_key = _resolve_effective_api_key(
        req=req,
        stored_model=stored_model,
        stored_api_key=str(tenant_settings.get("ai_api_key") or "").strip(),
        runtime_provider_cfg=runtime_provider_cfg if runtime_provider_name else {},
        target_provider_cfg=provider_cfg if provider_name else {},
    )

    _sync_runtime_model(cfg, req.model.strip())
    target_provider_name = target_provider or provider_name or next(iter(providers))
    target_provider_cfg = providers.get(target_provider_name)
    if not isinstance(target_provider_cfg, dict):
        raise HTTPException(status_code=400, detail=f"Provider '{target_provider_name}' 配置无效。")
    # __OPENCLAW_REDACTED__ 表示当前使用的是系统内置 Key，不覆盖 gateway 中的原始值
    if effective_api_key != "__OPENCLAW_REDACTED__":
        target_provider_cfg["apiKey"] = effective_api_key

    logger.info("提交 OpenClaw Gateway 配置更新: tenant=%s model=%s provider=%s", user["tenant_id"], req.model, target_provider_name)
    gateway_config_service.apply_runtime_config(cfg, base_hash)

    validation_status, validation_message = await _validate_openclaw_runtime()
    if validation_status != "success":
        try:
            current_cfg, current_hash = gateway_config_service.get_runtime_config()
            del current_cfg  # 仅取最新 hash，防并发覆盖
            gateway_config_service.apply_runtime_config(original_cfg, current_hash)
        except Exception as rollback_exc:  # pragma: no cover - best effort rollback
            logger.exception("OpenClaw 配置验证失败后回滚失败: %s", rollback_exc)
        raise HTTPException(status_code=400, detail=validation_message)

    validated_at = datetime.now(timezone.utc).isoformat()
    # 系统内置 Key 不写入数据库（用 null 表示"沿用系统默认"）
    db_api_key = None if effective_api_key == "__OPENCLAW_REDACTED__" else (effective_api_key or None)
    update_tenant_settings(
        user["tenant_id"],
        {
            "ai_model": req.model.strip(),
            "ai_api_key": db_api_key,
            "ai_validation_status": validation_status,
            "ai_validation_message": validation_message,
            "ai_validated_at": validated_at,
        },
        auth_token=auth_token,
    )

    return UpdateOpenClawResponse(
        success=True,
        message="配置已保存到数据库，并已同步到 OpenClaw Gateway。",
        restarted=True,
        validationStatus=validation_status,
        validationMessage=validation_message,
        validatedAt=validated_at,
        apiKeyMasked=_mask_key(effective_api_key),
    )
