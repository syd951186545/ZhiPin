# TODOS

## P2 — 运行 /design-consultation 生成 DESIGN.md

**What:** 运行 `/design-consultation` 为「机灵」建立设计系统文档 `DESIGN.md`。

**Why:** 项目当前缺少统一设计规范，每次扩展 UI 依赖个人判断，随着功能迭代容易出现风格漂移（字体、颜色、间距、组件用法不一致）。

**Pros:** 统一 UI 风格基线；后续每次 `/plan-design-review` 有明确校准参考；新功能 UI 决策更快。

**Cons:** 需要约 30 分钟 CC 时间；Phase 1 验证期不影响核心功能。

**Context:** Phase 1 完成后、Phase 2 第一个新 UI 功能开始前执行最合适。当前 shadcn/ui + Tailwind CSS 已有隐式规范，`/design-consultation` 会将其显式化并补充缺失决策（如品牌色、排版标尺等）。

**Depends on:** Phase 1 完成并通过真实用户验证后。

**Effort:** S（人工团队：2天 / CC+gstack：~30分钟）| **Priority:** P2

---

## P1 — 后端重启后 noVNC 孤儿进程自动清理

**What:** 在 `cleanup_orphaned_running_sessions()` 中增加一步：`docker exec openclaw pkill -f xvfb; pkill -f x11vnc; pkill -f novnc`，也可与进程占用的端口列表结合进行精准清理。

**Why:** 如果后端进程崩溃或重启，Docker 容器内的 Xvfb/x11vnc/noVNC 进程不会自动清理，导致占用端口和显示器编号，下次启动 live login 可能失败。

**Pros:** 防止端口耗尽和显示器编号冲突；幂等安全，多次执行无副作用。

**Cons:** 依赖 docker.sock 访问权限（已有），pkill 会影响所有同名进程（需按 display 编号精准 kill，增加少量复杂度）。

**Context:** `backend/services/live_login_service.py` 实现后，需要在 `backend/main.py` 的 lifespan 函数内的 `cleanup_orphaned_running_sessions()` 调用处扩展。精准清理方式：维护一个进程 PID 列表（写入 Docker volume 的 json 文件），重启时读取并 kill。

**Depends on:** `live_login_service.py` 实现完成后，与 noVNC 实施绑定处理。

**Effort:** XS（人工团队：~1小时 / CC+gstack：~5分钟）| **Priority:** P1（与 noVNC 实施绑定）

---

## P2 — storageState 加密导出/导入

**What:** 登录成功后，通过 Playwright CDP 提取 cookies/localStorage，加密存入 Supabase，让 OpenClaw 下次执行任务时可选择「从 DB 恢复会话」而不必依赖 Docker 卷。

**Why:** 当前方案依赖 Docker volume 共享 user-data-dir，如果 OpenClaw 容器重建或迁移服务器，登录态丢失。storageState 导出后会话共享不再依赖文件系统。

**Pros:** 跨部署会话恢复；可以在多个 OpenClaw 实例间共享登录态；为未来水平扩展铺路。

**Cons:** 加密密钥管理增加运维复杂度；storageState 包含敏感凭证，需要 AES-256 + 密钥轮换；PIPL 合规需要评估（登录 cookie 是否属于个人信息）。

**Context:** 可通过 CDP API `Network.getAllCookies` + `Runtime.evaluate(localStorage)` 提取会话数据。加密可用 Supabase Vault 或 backend 侧 AES 密钥（存 env var）。实现时需要为 `platform_configs` 表新增 `encrypted_session_state` 字段（JSONB, encrypted）。

**Depends on:** noVNC 登录方案上线并验证稳定后。

**Effort:** S（人工团队：~1天 / CC+gstack：~20分钟）| **Priority:** P2

---

## P2 — handoff_required 事件添加 Toast 通知

**What:** 当 Boss直聘 登录态失效触发 `handoff_required` 事件时，在 `JilingRecruit.tsx` 中弹出可见的 Toast 提示，而不仅仅是在监控面板（ExecutionPanel）里静默显示 failed 状态。

**Why:** 非技术用户的注意力不总在监控面板上。当前行为是 `useWorkflowStore` 收到 `handoff_required` 后将 `activeExecution.status` 置为 `failed`，但用户如果没有盯着面板，就不知道需要重新绑定账号，会疑惑"为什么没找到候选人"。

**Pros:** 提升用户感知，减少误解；用户能及时知道需要重新绑定 Boss直聘 账号；复用已有 shadcn/ui Toast 基础设施，改动极小。

**Cons:** 需要在 store 和页面间建立通知通道（event emitter、callback prop 或 Zustand subscriber）；Toast 在用户操作其他界面时可能打扰体验。

**Context:** `useWorkflowStore.ts` 中 `onHandoffRequired` 回调已经正确将 `activeExecution` 状态改为 `failed`，缺的只是通知层。`JilingRecruit.tsx` 已引入 shadcn/ui 组件，`Toaster` 基础设施可直接复用（参考项目中已有的 Toast 用法）。最简实现方案：在 `bindWorkflowSubscription` 调用处传入 `onHandoffRequired` 回调，在回调中调用 `toast.error("Boss直聘 登录已失效，请重新绑定账号")`。

**Depends on:** Phase 1 完成后，Phase 2 第一批 UX 改进时处理。

**Effort:** XS（人工：~1小时 / CC+gstack：~10分钟）| **Priority:** P2
