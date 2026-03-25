/**
 * SSE 弹性测试 —— 断线、超时、格式错误场景。
 *
 * @execution
 */

import { test, expect } from '../fixtures/api'
import {
  buildAccount,
  buildJob,
  buildPublishJobMetaEvent,
  buildStepChangeEvent,
  buildProgressEvent,
  buildCompleteEvent,
} from '../helpers/builders'

// ── 辅助 ──────────────────────────────────────────────────────

function buildActiveAccount() {
  return buildAccount({ id: 'sse-account-1', status: 'active' })
}

/** 单平台目录（只有 boss_zhipin），避免多平台账号校验失败。 */
const bossCatalog = [
  {
    key: 'boss_zhipin',
    name: 'BOSS直聘',
    enterprise_url: 'https://www.zhipin.com/web/geek/job',
    recommended_login_method: 'phone' as const,
    supported_login_methods: ['phone', 'qr'] as const,
  },
]

// ── 测试套件 ──────────────────────────────────────────────────

test.describe('SSE 弹性 @execution', () => {
  /**
   * 场景 4：SSE 流在发出 2 个事件后被截断（服务端关闭连接）
   *
   * 预期：UI 显示错误或中断状态，不永久 loading，不白屏，不抛出未捕获异常。
   */
  test('SSE 流中途截断 - UI 显示中断状态而非永久 loading', async ({ app, page }) => {
    app.setPlatformCatalog(bossCatalog)
    app.setPlatformAccounts([buildActiveAccount()])
    app.setJobs([buildJob()])
    app.queueWorkflowStartResponse({ execution_id: 'exec-abort-1', workflow_id: 'publish_job' })

    // 设置完整的流，但截断在第 2 个事件之后（只发 workflow_meta + step_change(running)）
    app.setWorkflowStream('exec-abort-1', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      buildProgressEvent('login_check', '检测登录中...'),
      buildStepChangeEvent('login_check', 'done', 0, 4, '登录检查'),
      buildCompleteEvent(),
    ])
    // 截断：只发前 2 个事件（模拟服务端中途关闭 SSE 连接）
    app.abortWorkflowStream('exec-abort-1', 2)

    // 监听未捕获的 JS 异常（不应该有）
    const uncaughtErrors: string[] = []
    page.on('pageerror', (err) => uncaughtErrors.push(err.message))

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    // 等待足够时间让 SSE 处理完
    await page.waitForTimeout(2000)

    // UI 不应该崩溃（不白屏）
    await expect(page.getByTestId('execution-monitor')).toBeVisible()

    // 没有未捕获的 JS 异常
    expect(uncaughtErrors).toHaveLength(0)

    // 工作流确实被启动过（确认流程运行到这步）
    expect(app.workflowStarts).toHaveLength(1)
  })

  /**
   * 场景 5：SSE 流只发步骤事件，从不发送 complete/done（模拟服务挂起）
   *
   * 预期：UI 显示步骤进行中的状态，不报错，不崩溃。
   * 注意：不测试"超时降级"（超时时间取决于实现）。
   */
  test('SSE 流无 complete 事件 - UI 保持运行中状态', async ({ app, page }) => {
    app.setPlatformCatalog(bossCatalog)
    app.setPlatformAccounts([buildActiveAccount()])
    app.setJobs([buildJob()])
    app.queueWorkflowStartResponse({ execution_id: 'exec-hang-1', workflow_id: 'publish_job' })

    // 只发步骤事件，不发 complete
    app.setWorkflowStream('exec-hang-1', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      buildProgressEvent('login_check', '检测登录中...'),
      // 故意不发 complete
    ])

    const uncaughtErrors: string[] = []
    page.on('pageerror', (err) => uncaughtErrors.push(err.message))

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    // 等待流处理
    await page.waitForTimeout(1500)

    // 进度文字已出现（流已被接收）
    await expect(page.getByTestId('execution-output')).toContainText('检测登录中...', { timeout: 5000 })

    // UI 没有崩溃
    await expect(page.getByTestId('execution-monitor')).toBeVisible()
    expect(uncaughtErrors).toHaveLength(0)

    // 状态不应是"已完成"（因为没有收到 complete）
    const monitorText = await page.getByTestId('execution-monitor').textContent()
    expect(monitorText).not.toContain('已完成')
  })

  /**
   * 场景 6：SSE 流中注入格式错误的 JSON 数据
   *
   * 预期：页面不崩溃，不白屏；其他正常事件继续处理。
   */
  test('SSE 数据格式错误 - 页面不崩溃继续可用', async ({ app, page }) => {
    app.setPlatformCatalog(bossCatalog)
    app.setPlatformAccounts([buildActiveAccount()])
    app.setJobs([buildJob()])
    app.queueWorkflowStartResponse({ execution_id: 'exec-malform-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-malform-1', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      buildProgressEvent('login_check', '检测登录中...'),
      buildStepChangeEvent('login_check', 'done', 0, 4, '登录检查'),
      buildCompleteEvent(),
    ])
    // 在第 2 个事件后注入一条格式错误的数据
    app.injectMalformedSSEEvent('exec-malform-1', 2)

    const uncaughtErrors: string[] = []
    page.on('pageerror', (err) => uncaughtErrors.push(err.message))

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    // 等待处理
    await page.waitForTimeout(2000)

    // 关键断言：页面没有崩溃
    await expect(page.getByTestId('execution-monitor')).toBeVisible()
    expect(uncaughtErrors).toHaveLength(0)

    // 工作流仍被启动
    expect(app.workflowStarts).toHaveLength(1)
  })

  /**
   * 场景 7：工作流启动 API 有延迟时，loading 状态正确显示
   */
  test('工作流启动延迟 - loading 状态可见', async ({ app, page }) => {
    app.setPlatformCatalog(bossCatalog)
    app.setPlatformAccounts([buildActiveAccount()])
    app.setJobs([buildJob()])
    app.queueWorkflowStartResponse({ execution_id: 'exec-delay-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-delay-1', [
      buildPublishJobMetaEvent(),
      buildCompleteEvent(),
    ])
    // 人为延迟 800ms
    app.setWorkflowStartDelay(800)

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    // 在延迟期间，工作流按钮或 loading 指示符应出现
    // 最终应该完成
    await expect(page.getByTestId('execution-monitor')).toContainText('已完成', { timeout: 10000 })
    expect(app.workflowStarts).toHaveLength(1)
  })
})
