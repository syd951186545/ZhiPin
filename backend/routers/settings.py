"""
OpenClaw 服务器配置 API

提供读取和更新 openclaw.json 的接口，支持从前端直接修改模型和 API Key。
修改后通过 Docker SDK 自动重启 openclaw 容器使配置生效。
"""

import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

# 容器内挂载路径（对应 docker-compose volumes 中的配置）
_CONFIG_PATH = Path("/app/openclaw-config.json")


# ── Pydantic Models ──────────────────────────────────────────

class OpenClawConfig(BaseModel):
    """前端可读的配置摘要（API Key 已脱敏）"""
    provider: str
    baseUrl: str
    model: str          # 格式: provider/model-id，如 minimax-cn/MiniMax-M2.5
    apiKeyMasked: str   # 脱敏后的 Key（前8位 + ***)
    hasApiKey: bool


class UpdateOpenClawRequest(BaseModel):
    model: str
    apiKey: Optional[str] = None   # 为 None 时保留原有 Key 不变


class UpdateOpenClawResponse(BaseModel):
    success: bool
    message: str
    restarted: bool   # 是否成功触发容器重启


# ── Helpers ──────────────────────────────────────────────────

def _read_config() -> dict:
    """读取 openclaw.json，不存在时返回空结构。"""
    if not _CONFIG_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="openclaw.json 尚未生成，请先运行 ./deploy/deploy.sh 完成初始部署。"
        )
    try:
        return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"配置文件解析失败: {e}")


def _write_config(config: dict) -> None:
    """写回 openclaw.json（原子写：先写临时文件再重命名）。"""
    tmp = _CONFIG_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.rename(_CONFIG_PATH)


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "***"
    return key[:8] + "***"


def _restart_openclaw() -> bool:
    """
    通过 Docker SDK 重启 openclaw 容器。
    找不到容器或 Docker 不可用时返回 False（不抛异常）。
    """
    try:
        import docker  # type: ignore
        client = docker.from_env(timeout=5)
        containers = client.containers.list(
            filters={"label": "com.docker.compose.service=openclaw"}
        )
        if not containers:
            logger.warning("未找到 openclaw 容器，跳过重启")
            return False
        for c in containers:
            logger.info(f"正在重启 openclaw 容器: {c.name}")
            c.restart(timeout=15)
        return True
    except ImportError:
        logger.warning("docker 库未安装，无法自动重启容器")
        return False
    except Exception as e:
        logger.warning(f"重启 openclaw 容器失败: {e}")
        return False


# ── Routes ───────────────────────────────────────────────────

@router.get("/openclaw", response_model=OpenClawConfig)
async def get_openclaw_config():
    """读取当前 openclaw 服务器配置（API Key 脱敏返回）。"""
    cfg = _read_config()

    providers: dict = cfg.get("models", {}).get("providers", {})
    provider_name = next(iter(providers), "")
    provider_cfg: dict = providers.get(provider_name, {})

    model: str = (
        cfg.get("agents", {})
           .get("defaults", {})
           .get("model", {})
           .get("primary", "")
    )
    api_key: str = provider_cfg.get("apiKey", "")

    return OpenClawConfig(
        provider=provider_name,
        baseUrl=provider_cfg.get("baseUrl", ""),
        model=model,
        apiKeyMasked=_mask_key(api_key),
        hasApiKey=bool(api_key),
    )


@router.post("/openclaw", response_model=UpdateOpenClawResponse)
async def update_openclaw_config(req: UpdateOpenClawRequest):
    """
    更新 openclaw 服务器配置并重启容器。

    - model: 完整模型 ID，格式 provider/model-id
    - apiKey: 新的 API Key；为 null/空时保留原有 Key
    """
    cfg = _read_config()

    # ── 1. 更新模型 ──────────────────────────────────────────
    # agents.defaults.model.primary
    cfg.setdefault("agents", {}) \
       .setdefault("defaults", {}) \
       .setdefault("model", {})["primary"] = req.model

    # agents.list[0].model（同步更新 list 中第一个 agent，即 HR_Juzi）
    agents_list: list = cfg.get("agents", {}).get("list", [])
    if agents_list:
        agents_list[0]["model"] = req.model

    # ── 2. 更新 API Key（仅在传入时覆盖）────────────────────
    if req.apiKey:
        providers: dict = cfg.setdefault("models", {}) \
                             .setdefault("providers", {})
        provider_name = next(iter(providers), None)
        if provider_name:
            providers[provider_name]["apiKey"] = req.apiKey
        else:
            logger.warning("providers 为空，无法写入 apiKey")

    # ── 3. 写回文件 ──────────────────────────────────────────
    _write_config(cfg)
    logger.info(f"openclaw 配置已更新: model={req.model}, apiKey={'已更新' if req.apiKey else '未变'}")

    # ── 4. 重启容器 ──────────────────────────────────────────
    restarted = _restart_openclaw()
    if restarted:
        msg = "配置已保存，OpenClaw 正在重启，约 15 秒后生效。"
    else:
        msg = "配置已保存。未检测到 Docker，请手动运行: ./deploy/deploy_update.sh -o"

    return UpdateOpenClawResponse(success=True, message=msg, restarted=restarted)
