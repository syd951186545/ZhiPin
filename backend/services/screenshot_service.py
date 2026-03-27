"""OpenClaw 截图引用解析、代理 URL 生成与字节抓取。"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import mimetypes
from pathlib import Path
from typing import Optional
from urllib.parse import quote, urlparse

import httpx
from fastapi import HTTPException

from config import get_settings


class ScreenshotService:
    """统一处理 OpenClaw 截图引用。"""

    def __init__(self) -> None:
        self._settings = get_settings()

    def build_proxy_url(self, raw_ref: str) -> str:
        value = (raw_ref or "").strip()
        if not value:
            raise ValueError("截图引用不能为空")
        encoded = base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii")
        signature = self._sign(encoded)
        return f"/api/openclaw/screenshot?ref={quote(encoded)}&sig={signature}"

    def decode_proxy_ref(self, encoded: str, signature: str) -> str:
        if not encoded or not signature:
            raise HTTPException(status_code=400, detail="缺少截图代理参数")
        expected = self._sign(encoded)
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=403, detail="截图代理签名无效")
        try:
            padded = encoded + "=" * (-len(encoded) % 4)
            return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        except Exception as exc:
            raise HTTPException(status_code=400, detail="截图引用解码失败") from exc

    async def fetch_image_bytes(self, raw_ref: str) -> tuple[bytes, str]:
        value = (raw_ref or "").strip()
        if not value:
            raise HTTPException(status_code=400, detail="截图引用不能为空")

        if value.startswith("http://") or value.startswith("https://"):
            return await self._fetch_remote_bytes(value)

        path = value[len("file://"):] if value.startswith("file://") else value
        if path.startswith("/"):
            return await self._fetch_openclaw_file(path)

        raise HTTPException(status_code=400, detail=f"不支持的截图引用: {value[:120]}")

    async def _fetch_remote_bytes(self, url: str) -> tuple[bytes, str]:
        local_candidate = self._resolve_remote_media_url_path(url)
        if local_candidate is not None:
            try:
                content = await self._read_local_file(local_candidate)
                return content, self._guess_content_type(local_candidate.as_posix())
            except FileNotFoundError:
                pass
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"读取本地截图文件失败: {exc}") from exc

        headers = self._auth_headers(url)
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail=f"拉取截图失败: HTTP {exc.response.status_code}") from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"拉取截图失败: {exc}") from exc

        content_type = resp.headers.get("content-type", "").split(";")[0].strip() or self._guess_content_type(url)
        return resp.content, content_type

    async def _fetch_openclaw_file(self, path: str) -> tuple[bytes, str]:
        local_candidate = self._resolve_local_mount_path(path)
        if local_candidate is not None:
            try:
                content = await self._read_local_file(local_candidate)
                return content, self._guess_content_type(local_candidate.as_posix())
            except FileNotFoundError:
                pass
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"读取本地截图文件失败: {exc}") from exc

        base_url = self._settings.openclaw_base_url.rstrip("/")
        candidates: list[str] = []
        if path.startswith("/"):
            candidates.append(f"{base_url}{path}")
        marker = ".openclaw/"
        idx = path.find(marker)
        if idx != -1:
            relative = path[idx + len(marker):].lstrip("/")
            candidates.append(f"{base_url}/{relative}")

        seen: set[str] = set()
        last_exc: Optional[Exception] = None
        for url in candidates:
            if url in seen:
                continue
            seen.add(url)
            try:
                return await self._fetch_remote_bytes(url)
            except HTTPException as exc:
                last_exc = exc
                continue

        # /tmp 等临时路径未必经由 OpenClaw HTTP 暴露，兜底用 Responses API 读取文件内容。
        if path.startswith("/tmp/") or path.startswith("/var/") or path.startswith("/root/") or path.startswith("/home/"):
            content = await self._fetch_local_file_via_response(path)
            return content, self._guess_content_type(path)

        if isinstance(last_exc, HTTPException):
            raise last_exc
        raise HTTPException(status_code=404, detail=f"无法通过 OpenClaw 获取截图文件: {path}")

    def _resolve_local_mount_path(self, path: str) -> Optional[Path]:
        normalized = (path or "").strip()
        if not normalized.startswith("/"):
            return None

        candidates: list[Path] = []
        home_mount = Path(self._settings.openclaw_home_mount.rstrip("/"))

        # 兼容 OpenClaw 仍返回 /home/node 路径的情况，统一映射到当前运行态挂载目录。
        if normalized.startswith("/home/node/"):
            suffix = normalized[len("/home/node/"):]
            candidates.append(home_mount / Path(suffix))

        # 当前 backopenclaw 单容器部署下，/opt/openclaw-home 可直接读取。
        candidates.append(Path(normalized))

        allowed_roots = [home_mount.resolve(strict=False)]
        media_mount = self._settings.openclaw_media_mount.rstrip("/")
        if media_mount:
            allowed_roots.append(Path(media_mount).resolve(strict=False))

        seen: set[str] = set()
        for candidate in candidates:
            key = candidate.as_posix()
            if key in seen:
                continue
            seen.add(key)
            resolved = candidate.resolve(strict=False)
            if not self._is_under_allowed_roots(resolved, allowed_roots):
                continue
            if resolved.is_file():
                return resolved
        return None

    def _resolve_remote_media_url_path(self, url: str) -> Optional[Path]:
        try:
            parsed = urlparse((url or "").strip())
        except Exception:
            return None

        media_path = parsed.path or ""
        relative = ""
        for marker in ("/media/", "media/"):
            if marker in media_path:
                relative = media_path.split(marker, 1)[1].lstrip("/")
                break

        if not relative:
            return None

        media_root = Path(self._settings.openclaw_media_mount.rstrip("/")).resolve(strict=False)
        candidate = (media_root / Path(relative)).resolve(strict=False)
        if not self._is_under_allowed_roots(candidate, [media_root]):
            return None
        return candidate if candidate.is_file() else None

    async def _read_local_file(self, path: Path) -> bytes:
        return await asyncio.to_thread(path.read_bytes)

    def _is_under_allowed_roots(self, candidate: Path, roots: list[Path]) -> bool:
        for root in roots:
            try:
                candidate.relative_to(root)
                return True
            except ValueError:
                continue
        return False

    def _auth_headers(self, url: str) -> dict[str, str]:
        headers: dict[str, str] = {}
        base_url = self._settings.openclaw_base_url.rstrip("/")
        if url.startswith(base_url):
            headers["Authorization"] = f"Bearer {self._settings.openclaw_auth_token}"
            headers["x-openclaw-agent-id"] = self._settings.openclaw_agent_id
        return headers

    def _sign(self, encoded: str) -> str:
        secret = (
            self._settings.openclaw_auth_token
            or self._settings.openclaw_agent_id
            or "openclaw-screenshot-proxy"
        )
        return hmac.new(secret.encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256).hexdigest()

    def _guess_content_type(self, value: str) -> str:
        content_type, _ = mimetypes.guess_type(value)
        return content_type or "application/octet-stream"

    async def _fetch_local_file_via_response(self, path: str) -> bytes:
        prompt = (
            f"请读取本地图片文件 {path} 的原始二进制内容，"
            "并仅返回其 base64 编码结果。"
            "不要使用 markdown，不要添加前后缀，不要解释，不要换行。"
        )
        payload = {
            "model": "openclaw",
            "input": prompt,
            "stream": False,
            "max_output_tokens": 32768,
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{self._settings.openclaw_base_url.rstrip('/')}/v1/responses",
                    headers={
                        "Authorization": f"Bearer {self._settings.openclaw_auth_token}",
                        "Content-Type": "application/json",
                        "x-openclaw-agent-id": self._settings.openclaw_agent_id,
                    },
                    json=payload,
                )
                resp.raise_for_status()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"通过 Responses API 读取本地截图失败: {exc}") from exc

        text = self._extract_output_text(resp.text)
        if not text:
            raise HTTPException(status_code=502, detail="Responses API 未返回截图内容")
        cleaned = "".join(text.split())
        try:
            return base64.b64decode(cleaned, validate=False)
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Responses API 返回的截图内容不是有效 base64") from exc

    def _extract_output_text(self, raw_json: str) -> str:
        try:
            payload = json.loads(raw_json)
        except Exception:
            return ""
        output = payload.get("output", [])
        if not isinstance(output, list):
            return ""
        chunks: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            for content in item.get("content", []):
                if isinstance(content, dict) and content.get("type") == "output_text":
                    chunks.append(str(content.get("text") or ""))
        return "".join(chunks).strip()


service = ScreenshotService()
