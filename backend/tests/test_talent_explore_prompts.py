"""
talent_explore 工作流 — 单元测试

覆盖：
- _sanitize_custom_message：4 个边界用例
- create_candidates_batch：upsert 路径（新增 / 幂等 / 空输入）
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

# ── _sanitize_custom_message ──────────────────────────────────


def test_sanitize_normal_string():
    """正常话术字符串原样返回（不超限、无控制 token）。"""
    from prompts.talent_explore import _sanitize_custom_message

    result = _sanitize_custom_message("您好，我们正在招聘服务员，薪资5K-8K，感兴趣吗？")
    assert result == "您好，我们正在招聘服务员，薪资5K-8K，感兴趣吗？"


def test_sanitize_none_input():
    """None 输入返回空字符串。"""
    from prompts.talent_explore import _sanitize_custom_message

    assert _sanitize_custom_message(None) == ""


def test_sanitize_removes_step_tokens():
    """过滤 [STEP_DONE:xxx] 和 [STEP_FAILED:xxx] 控制 token。"""
    from prompts.talent_explore import _sanitize_custom_message

    raw = "你好[STEP_DONE:login_check]，请问有兴趣吗？[STEP_FAILED:search_candidates]"
    result = _sanitize_custom_message(raw)
    assert "[STEP_DONE" not in result
    assert "[STEP_FAILED" not in result
    assert "你好" in result
    assert "有兴趣吗" in result


def test_sanitize_truncates_at_500():
    """超过 500 字符的输入截断至恰好 500 字符。"""
    from prompts.talent_explore import _sanitize_custom_message

    long_msg = "A" * 600
    result = _sanitize_custom_message(long_msg)
    assert len(result) == 500


# ── create_candidates_batch ───────────────────────────────────


def _mock_supabase_client(upsert_return_data: list[dict]):
    """构造 Supabase mock，.upsert().execute() 返回指定数据。"""
    mock_sb = MagicMock()
    mock_execute = MagicMock()
    mock_execute.data = upsert_return_data
    mock_sb.table.return_value.upsert.return_value.execute.return_value = mock_execute
    return mock_sb


def _make_candidate(**overrides) -> dict:
    return {
        "name": "张三",
        "source": "boss_zhipin",
        "job_id": "job-001",
        "stage": "new",
        **overrides,
    }


def test_batch_inserts_new_candidates():
    """新候选人调用 upsert 并返回写入结果。"""
    from services.supabase_client import create_candidates_batch

    candidate = _make_candidate(name="李四")
    expected = [{"id": "cand-001", "name": "李四"}]

    with patch("services.supabase_client.get_supabase", return_value=_mock_supabase_client(expected)):
        result = create_candidates_batch("tenant-001", [candidate], auth_token="tok")

    assert result == expected


def test_batch_upsert_is_idempotent():
    """重复调用相同候选人（upsert 幂等）——不报错，返回数据库返回结果。"""
    from services.supabase_client import create_candidates_batch

    candidate = _make_candidate(name="王五")
    # 模拟数据库 upsert 返回同一条记录（on_conflict 跳过更新）
    db_return = [{"id": "cand-002", "name": "王五"}]

    with patch("services.supabase_client.get_supabase", return_value=_mock_supabase_client(db_return)):
        result1 = create_candidates_batch("tenant-001", [candidate], auth_token="tok")
        result2 = create_candidates_batch("tenant-001", [candidate], auth_token="tok")

    assert result1 == db_return
    assert result2 == db_return


def test_batch_empty_input_returns_empty():
    """空候选人列表直接返回空列表，不调用 Supabase。"""
    from services.supabase_client import create_candidates_batch

    mock_sb = MagicMock()
    with patch("services.supabase_client.get_supabase", return_value=mock_sb):
        result = create_candidates_batch("tenant-001", [], auth_token="tok")

    assert result == []
    mock_sb.table.assert_not_called()
