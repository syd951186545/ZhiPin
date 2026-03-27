"""session_crypto 模块单元测试。"""

from __future__ import annotations

import pytest

from services.session_crypto import (
    decrypt_storage_state,
    encrypt_storage_state,
    generate_key,
)

# 固定测试密钥（32 字节 hex）
TEST_KEY_HEX = "a" * 64  # 32 bytes of 0xAA


class TestRoundtrip:
    """加密 → 解密 roundtrip。"""

    def test_roundtrip_with_hex_key(self):
        plaintext = '{"cookies": [{"name": "wt2", "value": "abc"}]}'
        encrypted = encrypt_storage_state(plaintext, key=TEST_KEY_HEX)
        decrypted = decrypt_storage_state(encrypted, key=TEST_KEY_HEX)
        assert decrypted == plaintext

    def test_roundtrip_with_bytes_key(self):
        key = bytes.fromhex(TEST_KEY_HEX)
        plaintext = "hello 中文测试"
        encrypted = encrypt_storage_state(plaintext, key=key)
        decrypted = decrypt_storage_state(encrypted, key=key)
        assert decrypted == plaintext

    def test_roundtrip_with_env_key(self, monkeypatch):
        monkeypatch.setenv("SESSION_ENCRYPTION_KEY", TEST_KEY_HEX)
        plaintext = "env key roundtrip"
        encrypted = encrypt_storage_state(plaintext)
        decrypted = decrypt_storage_state(encrypted)
        assert decrypted == plaintext

    def test_different_nonces(self):
        """同一明文两次加密应产生不同密文（随机 nonce）。"""
        plaintext = "same input"
        ct1 = encrypt_storage_state(plaintext, key=TEST_KEY_HEX)
        ct2 = encrypt_storage_state(plaintext, key=TEST_KEY_HEX)
        assert ct1 != ct2


class TestWrongKey:
    """使用错误密钥应失败。"""

    def test_wrong_key_raises(self):
        plaintext = "secret data"
        encrypted = encrypt_storage_state(plaintext, key=TEST_KEY_HEX)
        wrong_key = "b" * 64
        with pytest.raises(Exception):
            decrypt_storage_state(encrypted, key=wrong_key)


class TestCorruptedData:
    """损坏的密文应报错。"""

    def test_truncated_ciphertext(self):
        with pytest.raises(ValueError, match="长度不足"):
            decrypt_storage_state(b"short", key=TEST_KEY_HEX)

    def test_empty_ciphertext(self):
        with pytest.raises(ValueError, match="为空或长度不足"):
            decrypt_storage_state(b"", key=TEST_KEY_HEX)

    def test_tampered_ciphertext(self):
        plaintext = "tamper test"
        encrypted = encrypt_storage_state(plaintext, key=TEST_KEY_HEX)
        tampered = bytearray(encrypted)
        tampered[-1] ^= 0xFF
        with pytest.raises(Exception):
            decrypt_storage_state(bytes(tampered), key=TEST_KEY_HEX)


class TestEmptyInput:
    """空明文应报错。"""

    def test_empty_plaintext(self):
        with pytest.raises(ValueError, match="不能为空"):
            encrypt_storage_state("", key=TEST_KEY_HEX)


class TestGenerateKey:
    """generate_key 应返回有效的 hex 密钥。"""

    def test_key_format(self):
        key = generate_key()
        assert len(key) == 64
        # 验证 roundtrip 可用
        ct = encrypt_storage_state("test", key=key)
        assert decrypt_storage_state(ct, key=key) == "test"


class TestKeyResolution:
    """密钥解析边界情况。"""

    def test_missing_env_key(self, monkeypatch):
        monkeypatch.delenv("SESSION_ENCRYPTION_KEY", raising=False)

        class _Settings:
            session_encryption_key = ""

        monkeypatch.setattr("config.get_settings", lambda: _Settings())

        with pytest.raises(ValueError, match="未配置"):
            encrypt_storage_state("test")

    def test_invalid_key_length(self):
        with pytest.raises(ValueError, match="密钥长度错误"):
            encrypt_storage_state("test", key=b"tooshort")

    def test_fallback_to_settings_key(self, monkeypatch):
        monkeypatch.delenv("SESSION_ENCRYPTION_KEY", raising=False)

        class _Settings:
            session_encryption_key = TEST_KEY_HEX

        monkeypatch.setattr("config.get_settings", lambda: _Settings())

        encrypted = encrypt_storage_state("fallback settings key")
        decrypted = decrypt_storage_state(encrypted, key=TEST_KEY_HEX)
        assert decrypted == "fallback settings key"
