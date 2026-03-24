# 机灵招聘 - 测试用例说明文档

## 概述

本文档涵盖机灵招聘平台的全部自动化测试用例，包括前端 E2E 测试和后端 API 测试。

### 技术栈

| 层级 | 框架 | 说明 |
|------|------|------|
| 前端 E2E | Playwright | MockApp fixture 拦截所有 API，纯黑盒测试 |
| 后端 API | pytest + httpx AsyncClient | Mock 外部依赖（Supabase、OpenClaw），测试路由+校验 |

### 运行命令

```bash
# === 前端 ===
cd frontend
npm test                        # 全量 mock 测试
npm run test:platform           # 仅平台配置
npm run test:execute            # 仅招聘执行
npm run test:headed             # 有头浏览器
npm run test:debug              # 慢速调试（300ms slowMo）
npm run test:ui                 # Playwright UI 模式
npm run test:report             # 查看 HTML 报告

# === 后端 ===
cd backend
pip install -r requirements-test.txt
pytest                          # 全量
pytest tests/test_workflow.py   # 单文件
pytest -v                       # 详细输出
pytest -x                       # 遇到第一个失败即停
```

---

## 一、前端 E2E 测试

### 1.1 现有测试（17 个）

#### 平台和账号配置 `jiling-recruit.platform-config.spec.ts`（9 个）

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 页面基础可用且后端异常时展示告警 | 异常 | 后端不可用时告警可见，页面结构完整 |
| 2 | 新增账号成功并展示平台预览 | 正常 | 选平台→填名称→提交→预览卡展示 |
| 3 | 新增账号失败时保留表单并在重新打开后重置 | 异常 | 服务端错误保留表单，关闭重开清空 |
| 4 | 平台切换和默认账号切换保持正确 | 正常 | 多平台多账号切换，选中状态持久 |
| 5 | 手机号绑定支持等待验证码、日志过滤和提交成功 | 正常 | SSE 流→等待验证码→提交→完成 |
| 6 | 扫码绑定支持二维码刷新且替换截图 | 正常 | 二维码截图 src 随刷新更新 |
| 7 | 账号密码绑定支持二次验证并完成 | 正常 | 密码→2FA→提交→完成 |
| 8 | 绑定失败后重新打开仍保留最近失败状态和截图 | 异常 | 失败 badge、错误消息、截图持久 |
| 9 | 验证登录、解绑和删除账号链路可用 | 正常 | verify→unbind→delete dismiss→delete accept |

#### 招聘执行 `jiling-recruit.execute.spec.ts`（8 个）

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 页面基础可用且后端断开时禁用执行按钮 | 异常 | 后端 503 → 执行按钮 disabled |
| 2 | 缺少岗位详情时阻止启动并给出错误 | 异常 | 岗位加载失败 → 错误提示，无 workflow start |
| 3 | 模板校验失败时阻止启动并提示配置问题 | 异常 | validate 返回 errors → 展示校验错误 |
| 4 | 发布招聘公告成功链路渲染监控、截图和结果摘要 | 正常 | 完整 4 步 SSE → monitor、截图、公告内容 |
| 5 | artifact 事件可驱动截图展示与持久化状态更新 | 正常 | artifact_created + persisted → 截图 + "已落库" |
| 6 | 刷新后可从运行态接口恢复上次执行结果 | 正常 | localStorage + workflow-runs API → 恢复展示 |
| 7 | 多平台简历筛选任务上送正确 payload | 正常 | 多平台选择 → payload 含 platforms、account_ids |
| 8 | 执行中可主动停止并发送取消请求 | 正常 | 点击停止 → cancel API 调用 |

---

### 1.2 新增测试（56 个）

#### 1.2.1 全平台账号新增 `platform-config/all-platforms.spec.ts`（8 个）`@platform-config`

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 新增 BOSS直聘 账号成功并展示预览 | 正常 | 预览卡含 "BOSS直聘" |
| 2 | 新增 智联招聘 账号成功并展示预览 | 正常 | 预览卡含 "智联招聘" |
| 3 | 新增 猎聘 账号成功并展示预览 | 正常 | 预览卡含 "猎聘" |
| 4 | 新增 58同城 账号成功并展示预览 | 正常 | 预览卡含 "58同城" |
| 5 | 新增 前程无忧 账号成功并展示预览 | 正常 | 预览卡含 "前程无忧" |
| 6 | 新增 拉勾招聘 账号成功并展示预览 | 正常 | 预览卡含 "拉勾招聘" |
| 7 | 目录面板展示全部 6 个平台卡片 | 正常 | 6 个 platform-card-{key} 均可见 |
| 8 | 同一平台可添加多个账号 | 正常 | 同平台 2 个账号，列表包含两个 account-row |

#### 1.2.2 边界用例 `platform-config/edge-cases.spec.ts`（8 个）`@platform-config`

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 空账号名时提交按钮禁用 | 边界 | 选平台不填名称 → submit disabled |
| 2 | 不选平台时提交按钮禁用 | 边界 | 填名称不选平台 → submit disabled |
| 3 | 特殊字符账号名可正常提交 | 边界 | `<script>alert(1)</script>` 作名称 → 创建成功 |
| 4 | 超长账号名(200字符)可提交 | 边界 | 200 字符 → 创建成功 |
| 5 | 服务端重复错误保留表单 | 异常 | 500 错误 → 表单值保留 |
| 6 | 失败后关闭再打开重置表单 | 异常 | 关闭 → 重开 → 字段为空 |
| 7 | 纯空格账号名提交禁用 | 边界 | "   " → trim 后 submit disabled |
| 8 | 快速双击提交不重复创建 | 边界 | 连续两次 click → 只创建 1 个账号 |

#### 1.2.3 绑定方法异常路径 `platform-config/binding-methods.spec.ts`（8 个）`@platform-config`

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 手机号绑定 - 错误验证码导致绑定失败 | 异常 | 提交后 stream 发 failed → "失败" badge + 错误消息 |
| 2 | 手机号绑定 - 空验证码无法提交 | 边界 | 不填验证码 → submit disabled |
| 3 | 扫码绑定 - 多次刷新二维码连续替换截图 | 正常 | 2 次 refresh → src 依次更新 |
| 4 | 扫码绑定 - 扫码超时后仍可刷新 | 异常 | 超时 reason → 刷新按钮仍可用 |
| 5 | 密码绑定 - 凭据错误返回失败 | 异常 | stream 发 failed → "失败" badge |
| 6 | 密码绑定 - 二次验证字段可见 | 正常 | awaiting_password_2fa → secondary 输入框出现 |
| 7 | 绑定启动 API 返回 500 时显示错误 | 异常 | bind start error → 错误提示 |
| 8 | 绑定过程中日志正确过滤系统标记 | 正常 | `[LOGIN_STATE:]`、`![截图]` 不展示在日志中 |

#### 1.2.4 解绑验证删除 `platform-config/unbind-delete.spec.ts`（8 个）`@platform-config`

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 验证登录成功 - 状态变为已完成 | 正常 | verify completed → badge "已完成" |
| 2 | 验证登录失败 - 状态变为已过期 | 异常 | verify failed → badge "失败" |
| 3 | 解绑成功后状态变为待绑定 | 正常 | unbind completed → 绑定按钮可用 |
| 4 | 解绑对话框关闭不改变状态 | 边界 | 关闭 dialog → 账号保持 active |
| 5 | 删除确认弹窗取消保留账号 | 边界 | dialog.dismiss() → account-row 仍在 |
| 6 | 删除确认弹窗确认移除账号 | 正常 | dialog.accept() → account-row 消失 |
| 7 | 删除失败保留账号并显示错误 | 异常 | delete error → 账号仍在 + 错误提示 |
| 8 | 删除平台唯一账号后显示空状态 | 边界 | 删除唯一账号 → "当前平台暂无账号" |

#### 1.2.5 前置条件校验 `execution/preconditions.spec.ts`（5 个）`@execution`

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 后端断开禁用全部执行按钮 | 异常 | health=false → 3 个 workflow-action disabled |
| 2 | 无岗位时启动失败或按钮禁用 | 边界 | jobs=[] → 禁用或错误提示 |
| 3 | 岗位详情加载失败阻止启动 | 异常 | job detail 500 → 错误提示，无 start |
| 4 | 待绑定账号启动给出警告 | 异常 | status=needsLogin → 警告或禁用 |
| 5 | 过期账号启动给出警告 | 异常 | status=expired → 警告或禁用 |

#### 1.2.6 发布公告步骤详情 `execution/publish-job-steps.spec.ts`（7 个）`@execution`

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 4步完整成功 - 每步状态 pending→running→done | 正常 | 全量 stream → monitor "已完成" |
| 2 | 进度文本逐步累积 | 正常 | 多个 progress → output 内容递增 |
| 3 | 截图在步骤执行时实时展示 | 正常 | 2 步各 1 张截图 → img count=2 |
| 4 | 工作流元数据正确渲染步骤名 | 正常 | 4 个步骤名在 monitor 中出现 |
| 5 | payload 包含完整岗位和企业信息 | 正常 | workflowStarts[0] 含 job_title 等 |
| 6 | AI 公告内容正确提取展示 | 正常 | `【AI公告内容】...【/AI公告内容】` → output 展示 |
| 7 | 完成后可立即启动新工作流 | 正常 | complete → 按钮 "开始执行" 且 enabled |

#### 1.2.7 错误恢复 `execution/error-recovery.spec.ts`（6 个）`@execution`

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 步骤失败显示错误消息 | 异常 | login_check failed → 错误文本展示 |
| 2 | 生成公告失败保留登录检查已完成 | 异常 | generate_announcement failed → 前序保留 |
| 3 | 填写发布失败保留前序步骤 | 异常 | fill_and_publish failed |
| 4 | 验证结果失败 | 异常 | verify_result failed |
| 5 | 失败后截图保留 | 异常 | 失败前 2 张截图仍展示 |
| 6 | 失败后按钮回到可启动状态 | 异常 | error → 按钮 "开始执行" + enabled |

#### 1.2.8 UI 状态一致性 `execution/ui-state.spec.ts`（6 个）`@execution`

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | 启动后监控面板可见 | 正常 | execution-monitor visible |
| 2 | 空 SSE 流不崩溃 | 边界 | 空 events → 页面无报错 |
| 3 | 仅 workflow_meta 步骤全部 pending | 正常 | 只发 meta → 步骤列表全部 pending |
| 4 | 截图去重 | 边界 | 两个相同 URL screenshot → img count=1 |
| 5 | artifact_persisted 显示"已落库" | 正常 | artifact persisted → 含 "已落库" |
| 6 | 执行中按钮文本变为停止 | 正常 | running 状态 → 含 "停止" |

---

## 二、后端 API 测试（55 个）

### 2.1 健康检查 `test_health.py`（1 个）

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | test_health_returns_ok | 正常 | GET /api/health → 200, status="ok" |

### 2.2 平台目录 `test_platforms_catalog.py`（2 个）

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | test_get_catalog_returns_all_platforms | 正常 | GET → 200, 6 个平台 |
| 2 | test_catalog_items_have_required_fields | 正常 | 每项含 key, name, enterprise_url, supported_login_methods |

### 2.3 平台账号 CRUD `test_platform_accounts.py`（19 个）

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | test_list_accounts_success | 正常 | mock 返回 2 个账号 → 200 |
| 2 | test_list_accounts_no_auth | 异常 | 无 Authorization → 401 |
| 3 | test_list_accounts_invalid_token | 异常 | validate 抛 ValueError → 401 |
| 4 | test_list_accounts_forbidden | 异常 | validate 抛 PermissionError → 403 |
| 5 | test_list_accounts_empty | 边界 | 空列表 → 200, items=[] |
| 6 | test_create_account_success | 正常 | → 200, 返回 item 含 id |
| 7 | test_create_account_no_token | 异常 | 空 token → 401 |
| 8 | test_create_account_sets_browser_session_key | 正常 | 验证 update 被调用设置 session_key |
| 9 | test_create_account_unknown_platform | 异常 | 未知平台 → 500（潜在 bug） |
| 10 | test_delete_account_success | 正常 | → 200, success=true |
| 11 | test_delete_account_not_found | 异常 | → 404 |
| 12 | test_delete_account_no_auth | 异常 | → 401 |
| 13 | test_delete_clears_browser_session | 正常 | 有 session_key → 调用 clear_session_artifacts |
| 14 | test_delete_no_session_key_skips_clear | 边界 | 无 session_key → 不调用 clear |
| 15 | test_bind_start_success | 正常 | → 200, 返回 session |
| 16 | test_bind_start_account_not_found | 异常 | → 404 |
| 17 | test_bind_start_no_auth | 异常 | → 401 |
| 18 | test_verify_success | 正常 | → 200, 调用 start_verify_session |
| 19 | test_unbind_success | 正常 | → 200, 调用 start_unbind_session |

### 2.4 绑定会话 `test_platform_binding_sessions.py`（12 个）

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | test_submit_verification_success | 正常 | → 200, 返回更新后 session |
| 2 | test_submit_session_not_found | 异常 | → 404 |
| 3 | test_submit_account_not_found | 异常 | session 在但 account 不在 → 404 |
| 4 | test_submit_no_auth | 异常 | → 401 |
| 5 | test_get_session_success | 正常 | → 200, 返回 item |
| 6 | test_get_session_not_found | 异常 | → 404 |
| 7 | test_get_session_no_auth | 异常 | → 401 |
| 8 | test_refresh_qr_success | 正常 | → 200, 返回新 qr_screenshot_url |
| 9 | test_refresh_qr_wrong_status | 异常 | 非 awaiting_qr → 400 |
| 10 | test_refresh_qr_session_not_found | 异常 | → 404 |
| 11 | test_stream_no_token | 异常 | 无 ?token= → 401 |
| 12 | test_stream_returns_sse_content_type | 正常 | → 200, text/event-stream |

### 2.5 工作流 `test_workflow.py`（18 个）

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | test_start_publish_job_success | 正常 | → 200, 返回 execution_id |
| 2 | test_start_no_token | 异常 | → 401 |
| 3 | test_start_invalid_token | 异常 | validate 抛 ValueError → 401 |
| 4 | test_start_forbidden | 异常 | validate 抛 PermissionError → 403 |
| 5 | test_start_unknown_workflow | 异常 | workflow_id="invalid" → 400 |
| 6 | test_start_account_not_found | 异常 | account_id 不存在 → 404 |
| 7 | test_start_account_not_active | 异常 | status=needsLogin → 400 |
| 8 | test_start_account_no_session_key | 异常 | session_key 为空 → 400 |
| 9 | test_start_overrides_tenant_id | 安全 | body tenant_id 被覆盖为 validated 值 |
| 10 | test_start_no_account_id | 异常 | 缺 account_id → 400/422 |
| 11 | test_start_resume_screen_success | 正常 | 多平台工作流 → 200 |
| 12 | test_start_resume_screen_missing_account | 异常 | 缺少平台账号 → 400 |
| 13 | test_cancel_existing_execution | 正常 | → 200, "已发送取消请求" |
| 14 | test_cancel_nonexistent_execution | 异常 | → 404 |
| 15 | test_cancel_already_completed | 边界 | 不在 running → 200（幂等） |
| 16 | test_status_returns_cancelled_false | 正常 | 默认 → cancelled=false |
| 17 | test_status_returns_cancelled_true | 正常 | 预设 cancelled → cancelled=true |
| 18 | test_stream_nonexistent | 异常 | 不在 event_queues → 404 |

### 2.6 OpenClaw 健康检查 `test_workflow_check_openclaw.py`（3 个）

| # | 用例名 | 分类 | 验证要点 |
|---|--------|------|---------|
| 1 | test_openclaw_healthy | 正常 | httpx 200 → status="ok" |
| 2 | test_openclaw_unreachable | 异常 | 连接错误 → 503 |
| 3 | test_openclaw_http_error | 异常 | httpx 500 → 503 |

---

## 三、统计

| 模块 | 现有 | 新增 | 合计 |
|------|------|------|------|
| 前端 - 平台配置 | 9 | 32 | 41 |
| 前端 - 招聘执行 | 8 | 24 | 32 |
| 后端 API | 0 | 55 | 55 |
| **总计** | **17** | **111** | **128** |

### 测试分类分布

| 分类 | 数量 | 占比 |
|------|------|------|
| 正常路径 | 58 | 45% |
| 异常路径 | 51 | 40% |
| 边界用例 | 19 | 15% |

---

## 四、文件清单

### 前端测试文件

```
frontend/tests/e2e/
├── fixtures/
│   ├── api.ts                                    # MockApp fixture（已扩展 6 平台）
│   └── auth.ts                                   # Auth session 注入
├── helpers/
│   ├── sse.ts                                    # SSE 事件格式化
│   ├── builders.ts                               # 共享数据构建器 [新建]
│   └── assertions.ts                             # 可复用操作辅助 [新建]
├── platform-config/
│   ├── all-platforms.spec.ts                     # 全平台账号新增 (8) [新建]
│   ├── edge-cases.spec.ts                        # 边界用例 (8) [新建]
│   ├── binding-methods.spec.ts                   # 绑定异常路径 (8) [新建]
│   └── unbind-delete.spec.ts                     # 解绑验证删除 (8) [新建]
├── execution/
│   ├── preconditions.spec.ts                     # 前置条件 (5) [新建]
│   ├── publish-job-steps.spec.ts                 # 步骤详情 (7) [新建]
│   ├── error-recovery.spec.ts                    # 错误恢复 (6) [新建]
│   └── ui-state.spec.ts                          # UI 状态 (6) [新建]
├── jiling-recruit.platform-config.spec.ts        # 原有平台配置 (9)
└── jiling-recruit.execute.spec.ts                # 原有招聘执行 (8)
```

### 后端测试文件

```
backend/
├── requirements-test.txt                         # 测试依赖 [新建]
├── pytest.ini                                    # pytest 配置 [新建]
└── tests/
    ├── __init__.py                               # [新建]
    ├── conftest.py                               # 共享 fixtures [新建]
    ├── test_health.py                            # 健康检查 (1) [新建]
    ├── test_platforms_catalog.py                  # 平台目录 (2) [新建]
    ├── test_platform_accounts.py                  # 平台账号 CRUD (19) [新建]
    ├── test_platform_binding_sessions.py          # 绑定会话 (12) [新建]
    ├── test_workflow.py                           # 工作流 (18) [新建]
    └── test_workflow_check_openclaw.py            # OpenClaw 检查 (3) [新建]
```
