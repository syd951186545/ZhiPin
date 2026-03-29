# TODOS

## P2 — storageState 持久化安全加固

**What:** 补齐 `encrypted_session_state` 的安全治理，包括密钥轮换方案、历史密文兼容、过期/吊销策略，以及合规边界说明。

**Why:** 当前 storageState 提取、AES-256-GCM 加密、Supabase 落库和执行前恢复链路已经可用，但仍依赖单一运行密钥；若后续需要迁移环境、轮换密钥或处理账号解绑后的凭证清理，缺少明确机制。

**Pros:** 降低长期持有登录态带来的安全风险；便于后续扩容或迁移环境；让“重新绑定/解绑/失效恢复”的行为边界更清晰。

**Cons:** 需要补充迁移策略和运维约束；会引入一定实现与测试成本。

**Context:** 当前代码已实现从 DB 优先恢复、workspace 兜底恢复。此项不再是“功能补齐”，而是“安全与运维加固”。优先考虑：
- 密钥版本号或 key id，支持未来平滑轮换
- 账号解绑或判定失效时，是否同步清空 `encrypted_session_state`
- 是否需要为持久会话增加更新时间/过期时间字段
- 会话数据是否需要审计记录或最小化存储范围

**Depends on:** 现有 live login / browser-ready 恢复链路稳定运行后。

**Effort:** S（人工团队：~1天）| **Priority:** P2

---

## P2 — handoff_required 事件添加 Toast 通知

**What:** 当 Boss直聘 登录态失效触发 `handoff_required` 事件时，在 `JilingRecruit.tsx` 中弹出可见的 Toast 提示，而不仅仅是在监控面板（ExecutionPanel）里静默显示 failed 状态。

**Why:** 非技术用户的注意力不总在监控面板上。当前行为是 `useWorkflowStore` 收到 `handoff_required` 后将 `activeExecution.status` 置为 `failed`，但用户如果没有盯着面板，就不知道需要重新绑定账号，会疑惑"为什么没找到候选人"。

**Pros:** 提升用户感知，减少误解；用户能及时知道需要重新绑定 Boss直聘 账号；复用已有 shadcn/ui Toast 基础设施，改动极小。

**Cons:** 需要在 store 和页面间建立通知通道（event emitter、callback prop 或 Zustand subscriber）；Toast 在用户操作其他界面时可能打扰体验。

**Context:** `useWorkflowStore.ts` 中 `onHandoffRequired` 回调已经正确将 `activeExecution` 状态改为 `failed`，缺的只是通知层。`JilingRecruit.tsx` 已引入 shadcn/ui 组件，`Toaster` 基础设施可直接复用（参考项目中已有的 Toast 用法）。最简实现方案：在 `bindWorkflowSubscription` 调用处传入 `onHandoffRequired` 回调，在回调中调用 `toast.error("Boss直聘 登录已失效，请重新绑定账号")`。

**Depends on:** Phase 1 完成后，Phase 2 第一批 UX 改进时处理。

**Effort:** XS（人工：~1小时 / CC+gstack：~10分钟）| **Priority:** P2
