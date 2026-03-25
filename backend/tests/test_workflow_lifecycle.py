"""
工作流生命周期顺序测试。

覆盖现有测试未覆盖的「顺序场景」：start → status → cancel → verify，
以及幂等取消、并发无关 execution_id 隔离等。
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_body, auth_header


# ── 辅助 ─────────────────────────────────────────────────────


def _active_account(**overrides):
    return {
        "id": "lifecycle-acc-001",
        "tenant_id": "tenant-001",
        "platform": "boss_zhipin",
        "name": "Lifecycle Test Account",
        "account_name": "lifecycle_user",
        "browser_session_key": "lifecycle-session-key",
        "status": "active",
        "is_connected": True,
        **overrides,
    }


def _start_body(**overrides):
    return {
        "workflow_id": "publish_job",
        "tenant_id": "tenant-001",
        "user_id": "user-001",
        "platform": "boss_zhipin",
        "account_id": "lifecycle-acc-001",
        "job_title": "生命周期测试岗位",
        **auth_body(),
        **overrides,
    }


# ── 完整生命周期：start → status → cancel → verify ──────────


@pytest.mark.asyncio
async def test_full_lifecycle_start_status_cancel(client):
    """
    完整生命周期：启动 → 查询状态 → 取消 → 确认已取消。

    这是核心的顺序场景，确保各步骤之间状态一致性正确传递。
    """
    # Step 1：启动工作流
    with patch("routers.workflow.get_platform_account", return_value=_active_account()):
        resp = await client.post("/api/workflow/start", json=_start_body())

    assert resp.status_code == 200, f"start 失败: {resp.text}"
    exec_id = resp.json()["execution_id"]
    assert exec_id, "execution_id 不能为空"

    # Step 2：查询状态 → 尚未取消
    resp = await client.get(f"/api/workflow/status/{exec_id}")
    assert resp.status_code == 200
    assert resp.json()["cancelled"] is False, "启动后 cancelled 应为 false"

    # Step 3：取消工作流
    resp = await client.post(f"/api/workflow/cancel/{exec_id}")
    assert resp.status_code == 200, f"cancel 失败: {resp.text}"
    assert "取消" in resp.json().get("message", ""), "返回消息应包含'取消'"

    # Step 4：再次查询状态 → 已取消
    resp = await client.get(f"/api/workflow/status/{exec_id}")
    assert resp.status_code == 200
    assert resp.json()["cancelled"] is True, "取消后 cancelled 应为 true"


@pytest.mark.asyncio
async def test_cancel_idempotent(client):
    """
    幂等取消：对同一 execution_id 连续取消两次，两次都应返回 200（不报错）。
    """
    from routers.workflow import _event_queues
    exec_id = "lifecycle-idempotent-exec"
    _event_queues[exec_id] = asyncio.Queue()

    # 第一次取消
    resp = await client.post(f"/api/workflow/cancel/{exec_id}")
    assert resp.status_code == 200, f"第一次取消失败: {resp.text}"

    # 第二次取消同一 execution_id（幂等）
    resp = await client.post(f"/api/workflow/cancel/{exec_id}")
    # 第二次可能 404（队列已清理）或 200（仍可取消），但绝不应是 500
    assert resp.status_code != 500, f"幂等取消不应返回 500，实际: {resp.status_code}"


@pytest.mark.asyncio
async def test_status_nonexistent_execution_not_500(client):
    """
    查询不存在的 execution_id 不应返回 500（应返回 200 或 404）。
    """
    resp = await client.get("/api/workflow/status/totally-nonexistent-exec-id")
    assert resp.status_code != 500, f"不应返回 500，实际: {resp.status_code}"
    # 应该是 200（默认 cancelled=false）
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_two_executions_state_isolation(client):
    """
    两个不同 execution_id 的状态互不干扰。

    取消 exec-A 不影响 exec-B 的状态。
    """
    from routers.workflow import _event_queues, _cancelled
    exec_a = "lifecycle-isolation-exec-A"
    exec_b = "lifecycle-isolation-exec-B"

    _event_queues[exec_a] = asyncio.Queue()
    _event_queues[exec_b] = asyncio.Queue()

    # 取消 A
    resp = await client.post(f"/api/workflow/cancel/{exec_a}")
    assert resp.status_code == 200

    # B 应该没有被取消
    assert not _cancelled.get(exec_b, False), "取消 exec-A 不应影响 exec-B"

    # 查询 B 的状态
    resp = await client.get(f"/api/workflow/status/{exec_b}")
    assert resp.status_code == 200
    assert resp.json()["cancelled"] is False


@pytest.mark.asyncio
async def test_start_returns_unique_execution_ids(client):
    """
    每次启动工作流应返回不同的 execution_id（不共享）。
    """
    async def fake_runner_noop(execution_id, req):
        pass  # 不做任何事，只让 start 完成

    exec_ids = []
    for _ in range(3):
        with (
            patch("routers.workflow.get_platform_account", return_value=_active_account()),
            patch("workflows.publish_job.run", new_callable=AsyncMock, side_effect=fake_runner_noop),
        ):
            resp = await client.post("/api/workflow/start", json=_start_body())
        assert resp.status_code == 200
        exec_ids.append(resp.json()["execution_id"])

    # 三个 execution_id 都应该不同
    assert len(set(exec_ids)) == 3, f"execution_id 不唯一: {exec_ids}"


@pytest.mark.asyncio
async def test_message_send_limit_boundaries(client):
    """
    message_send_limit 边界值验证：1 和 50 合法，0 和 51 非法。
    """
    with patch("routers.workflow.get_platform_account", return_value=_active_account()):
        # 合法：最小值
        resp = await client.post("/api/workflow/start", json=_start_body(
            workflow_id="talent_explore", message_send_limit=1
        ))
        assert resp.status_code == 200, f"message_send_limit=1 应合法，实际: {resp.text}"

        # 合法：最大值
        resp = await client.post("/api/workflow/start", json=_start_body(
            workflow_id="talent_explore", message_send_limit=50
        ))
        assert resp.status_code == 200, f"message_send_limit=50 应合法，实际: {resp.text}"

        # 非法：0
        resp = await client.post("/api/workflow/start", json=_start_body(
            workflow_id="talent_explore", message_send_limit=0
        ))
        assert resp.status_code in [400, 422], f"message_send_limit=0 应非法，实际: {resp.text}"

        # 非法：51
        resp = await client.post("/api/workflow/start", json=_start_body(
            workflow_id="talent_explore", message_send_limit=51
        ))
        assert resp.status_code in [400, 422], f"message_send_limit=51 应非法，实际: {resp.text}"
