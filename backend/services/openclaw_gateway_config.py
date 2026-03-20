"""OpenClaw Gateway 配置管理服务。"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import HTTPException

from config import get_settings

logger = logging.getLogger(__name__)

_OPENCLAW_SERVICE_LABEL = "com.docker.compose.service=openclaw"
_GATEWAY_WS_URL = "ws://127.0.0.1:18789"


class OpenClawGatewayConfigService:
    """通过 OpenClaw Gateway RPC 读取/更新配置。"""

    def __init__(self) -> None:
        self._settings = get_settings()

    def get_runtime_config(self) -> tuple[dict[str, Any], str]:
        payload = self._gateway_call("config.get", {})
        raw = payload.get("raw")
        config_hash = payload.get("hash")

        if not raw or not isinstance(raw, str):
            raise HTTPException(status_code=502, detail="Gateway 未返回原始配置内容，无法读取 OpenClaw 配置。")
        if not config_hash or not isinstance(config_hash, str):
            raise HTTPException(status_code=502, detail="Gateway 未返回配置哈希，无法安全更新 OpenClaw 配置。")

        try:
            config = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=502, detail=f"Gateway 返回的配置不是有效 JSON: {exc}") from exc

        return config, config_hash

    def apply_runtime_config(self, config: dict[str, Any], base_hash: str) -> None:
        self._gateway_call(
            "config.apply",
            {
                "raw": json.dumps(config, ensure_ascii=False, indent=2),
                "baseHash": base_hash,
                "note": "Updated by ZhiPin backend settings API",
            },
        )

    def _gateway_call(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        container = self._get_openclaw_container()
        command = [
            "openclaw",
            "gateway",
            "call",
            method,
            "--url",
            _GATEWAY_WS_URL,
            "--token",
            self._settings.openclaw_auth_token,
            "--timeout",
            "10000",
            "--json",
            "--params",
            json.dumps(params, ensure_ascii=False),
        ]

        try:
            result = container.exec_run(command, demux=True)
        except Exception as exc:  # pragma: no cover - Docker runtime failure
            logger.exception("执行 OpenClaw Gateway RPC 失败: %s", method)
            raise HTTPException(status_code=503, detail=f"无法调用 OpenClaw Gateway RPC: {exc}") from exc

        stdout, stderr = result.output if isinstance(result.output, tuple) else (result.output, b"")
        stdout_text = (stdout or b"").decode("utf-8", errors="replace").strip()
        stderr_text = (stderr or b"").decode("utf-8", errors="replace").strip()

        if result.exit_code != 0:
            detail = stderr_text or stdout_text or f"RPC {method} 执行失败"
            raise HTTPException(status_code=502, detail=detail)

        response = self._parse_json_output(stdout_text, method)
        if not response.get("ok", False):
            error = response.get("error") or {}
            message = error.get("message") if isinstance(error, dict) else None
            raise HTTPException(status_code=502, detail=message or f"Gateway RPC {method} 返回失败")

        payload = response.get("payload")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=502, detail=f"Gateway RPC {method} 未返回可解析 payload")
        return payload

    def _get_openclaw_container(self):
        try:
            import docker  # type: ignore

            client = docker.from_env(timeout=5)
            containers = client.containers.list(filters={"label": _OPENCLAW_SERVICE_LABEL})
        except ImportError as exc:
            raise HTTPException(status_code=500, detail="docker SDK 未安装，无法管理 OpenClaw Gateway 配置。") from exc
        except Exception as exc:  # pragma: no cover - Docker runtime failure
            raise HTTPException(status_code=503, detail=f"无法连接 Docker 守护进程: {exc}") from exc

        if not containers:
            raise HTTPException(status_code=503, detail="未找到运行中的 openclaw 容器，无法读取 Gateway 配置。")
        return containers[0]

    @staticmethod
    def _parse_json_output(raw_output: str, method: str) -> dict[str, Any]:
        if not raw_output:
            raise HTTPException(status_code=502, detail=f"Gateway RPC {method} 未返回任何输出")

        try:
            return json.loads(raw_output)
        except json.JSONDecodeError:
            for line in reversed(raw_output.splitlines()):
                line = line.strip()
                if not line:
                    continue
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue
            raise HTTPException(status_code=502, detail=f"Gateway RPC {method} 输出不是有效 JSON")


service = OpenClawGatewayConfigService()
