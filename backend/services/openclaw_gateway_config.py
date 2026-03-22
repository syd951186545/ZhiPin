"""OpenClaw Gateway 配置管理服务。"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from fastapi import HTTPException

from config import get_settings

logger = logging.getLogger(__name__)


class OpenClawGatewayConfigService:
    """通过 OpenClaw Gateway HTTP API 读取/更新配置。"""

    def __init__(self) -> None:
        self._settings = get_settings()

    def get_runtime_config(self) -> tuple[dict[str, Any], str]:
        payload = self._gateway_call("config.get", {})
        config = payload.get("parsed")
        config_hash = payload.get("hash")

        if not isinstance(config, dict):
            raise HTTPException(status_code=502, detail="Gateway 未返回可解析配置内容，无法读取 OpenClaw 配置。")
        if not config_hash or not isinstance(config_hash, str):
            raise HTTPException(status_code=502, detail="Gateway 未返回配置哈希，无法安全更新 OpenClaw 配置。")

        return config, config_hash

    def apply_runtime_config(self, config: dict[str, Any], base_hash: str) -> None:
        self._gateway_call(
            "config.apply",
            {
                "raw": json.dumps(config, ensure_ascii=False, indent=2),
                "baseHash": base_hash,
                "note": "Updated by JiLing platform backend settings API",
            },
        )

    def apply_management_api_defaults(self, config: dict[str, Any]) -> bool:
        gateway_cfg = config.setdefault("gateway", {})
        changed = False

        tools_cfg = gateway_cfg.setdefault("tools", {})
        allow_list = tools_cfg.get("allow")
        if not isinstance(allow_list, list):
            allow_list = []
            tools_cfg["allow"] = allow_list
            changed = True
        if "gateway" not in allow_list:
            allow_list.append("gateway")
            changed = True

        http_cfg = gateway_cfg.setdefault("http", {})
        endpoints_cfg = http_cfg.setdefault("endpoints", {})
        responses_cfg = endpoints_cfg.setdefault("responses", {})
        if responses_cfg.get("enabled") is not True:
            responses_cfg["enabled"] = True
            changed = True

        return changed

    def ensure_management_apis_enabled(self) -> bool:
        config, base_hash = self.get_runtime_config()
        if not self.apply_management_api_defaults(config):
            return False
        self.apply_runtime_config(config, base_hash)
        return True

    def _gateway_call(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            response = httpx.post(
                f"{self._settings.openclaw_base_url.rstrip('/')}/tools/invoke",
                headers={
                    "Authorization": f"Bearer {self._settings.openclaw_auth_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "tool": "gateway",
                    "action": method,
                    "args": params,
                },
                timeout=15.0,
            )
        except Exception as exc:
            logger.exception("调用 OpenClaw Gateway HTTP API 失败: %s", method)
            raise HTTPException(status_code=503, detail=f"无法调用 OpenClaw Gateway API: {exc}") from exc

        detail = response.text.strip()
        if response.status_code == 404:
            raise HTTPException(
                status_code=502,
                detail="OpenClaw Gateway HTTP API 未开放 gateway 工具，请确认 gateway.tools.allow 已允许 gateway。",
            )
        if response.status_code == 401:
            raise HTTPException(status_code=502, detail="OpenClaw Gateway 认证失败，请检查 token 配置。")
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=detail or f"Gateway API {method} 调用失败")

        try:
            payload = response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail=f"Gateway API {method} 返回不是有效 JSON") from exc

        if not isinstance(payload, dict):
            raise HTTPException(status_code=502, detail=f"Gateway API {method} 返回格式无效")
        if payload.get("ok") is False:
            error = payload.get("error") or {}
            message = error.get("message") if isinstance(error, dict) else None
            raise HTTPException(status_code=502, detail=message or f"Gateway API {method} 返回失败")

        result = payload.get("result", payload)
        if not isinstance(result, dict):
            raise HTTPException(status_code=502, detail=f"Gateway API {method} 返回结果格式无效")

        # 实际数据嵌套在 result.details.result 中
        details = result.get("details")
        if isinstance(details, dict):
            inner = details.get("result")
            if isinstance(inner, dict):
                return inner

        # 兼容旧版响应格式：result.result
        nested = result.get("result")
        if isinstance(nested, dict):
            result = nested

        return result


service = OpenClawGatewayConfigService()
