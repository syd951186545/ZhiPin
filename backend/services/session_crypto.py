"""
storageState AES-256-GCM 加密/解密。

登录成功后将浏览器 cookies + localStorage 加密存入 Supabase，
容器重建时可从数据库恢复会话，不再依赖 Docker volume 单一持久层。
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_NONCE_LEN = 12  # GCM 推荐 96-bit nonce


def _resolve_key(key: bytes | str | None = None) -> bytes:
    """将 key 规范化为 32 字节 AES-256 密钥。

    接受:
      - 32 字节 raw bytes
      - hex 编码字符串 (64 chars)
      - base64 编码字符串
      - None → 优先从环境变量 SESSION_ENCRYPTION_KEY 读取，缺失时回退到后端配置
    """
    if key is None:
        raw = os.environ.get("SESSION_ENCRYPTION_KEY", "")
        if not raw:
            try:
                from config import get_settings

                raw = get_settings().session_encryption_key
            except Exception:
                raw = ""
        if not raw:
            raise ValueError("SESSION_ENCRYPTION_KEY 未配置")
        key = raw

    if isinstance(key, str):
        key = key.strip()
        # hex: 64 hex chars → 32 bytes
        if len(key) == 64:
            try:
                return bytes.fromhex(key)
            except ValueError:
                pass
        # base64 fallback
        try:
            decoded = base64.b64decode(key)
            if len(decoded) == 32:
                return decoded
        except Exception:
            pass
        raise ValueError(f"无法解析密钥：期望 32 字节，得到 {len(key)} 字符的字符串")

    if isinstance(key, bytes) and len(key) == 32:
        return key

    raise ValueError(f"密钥长度错误：期望 32 字节，得到 {len(key)} 字节")


def encrypt_storage_state(plaintext: str, key: bytes | str | None = None) -> bytes:
    """AES-256-GCM 加密。返回 nonce (12B) + ciphertext+tag。"""
    if not plaintext:
        raise ValueError("plaintext 不能为空")
    k = _resolve_key(key)
    nonce = os.urandom(_NONCE_LEN)
    ct = AESGCM(k).encrypt(nonce, plaintext.encode("utf-8"), None)
    return nonce + ct


def decrypt_storage_state(ciphertext: bytes, key: bytes | str | None = None) -> str:
    """AES-256-GCM 解密。输入格式：nonce (12B) + ciphertext+tag。"""
    if not ciphertext or len(ciphertext) <= _NONCE_LEN:
        raise ValueError("ciphertext 为空或长度不足")
    k = _resolve_key(key)
    nonce = ciphertext[:_NONCE_LEN]
    ct = ciphertext[_NONCE_LEN:]
    return AESGCM(k).decrypt(nonce, ct, None).decode("utf-8")


def generate_key() -> str:
    """生成随机 AES-256 密钥，返回 hex 编码字符串（方便写入 .env）。"""
    return os.urandom(32).hex()
