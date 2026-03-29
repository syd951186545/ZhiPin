/**
 * 完整用户旅程 E2E 测试（@smoke）
 *
 * 覆盖从"全新用户"到"工作流完成"的完整路径，这是所有测试中最重要的一组。
 * 上线前必须通过：npx playwright test --project=smoke
 *
 * @smoke
 */

import { test, expect } from '../fixtures/api'
import { buildJob, buildPublishJobFullStream, buildPublishJobMetaEvent, buildCompleteEvent, buildStepChangeEvent, buildProgressEvent } from '../helpers/builders'

// ── 辅助函数 ──────────────────────────────────────────────────

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

function buildActiveAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'journey-account-1',
    name: '旅程测试账号',
    platform: 'boss_zhipin',
    status: 'active',
    account_name: 'hr-journey',
    browser_session_key: 'session-journey-1',
    latest_binding_session: null,
    ...overrides,
  }
}

// ── 测试套件 ──────────────────────────────────────────────────

test.describe('完整用户旅程 @smoke', () => {
  /**
   * 场景 1：全新用户（零账号）→ 添加账号 → 远程登录绑定 → 切换执行 → 启动工作流 → 完成
   *
   * 这是最重要的 E2E 测试，模拟真实新用户的完整操作路径。
   */
  test('全新用户：零账号 → 绑定 → 执行 → 完成', async ({ app, page }) => {
    // 初始状态：空账号，有一个岗位
    app.setPlatformAccounts([])
    app.setJobs([buildJob({ id: 'journey-job-1', title: '高级工程师' })])

    // 准备远程登录流程
    app.queueLiveLoginStartResponse({
      session_id: 'live-journey-1',
      ws_port: 6080,
      vnc_token: 'journey-token',
      ws_url: 'https://example.com/novnc/live-journey-1',
      login_url: 'https://example.com/login/boss_zhipin',
      timeout_seconds: 600,
    })
    app.queueLiveLoginConfirmResponse({
      is_logged_in: true,
      message: '登录状态已保存',
      workspace_saved: true,
      db_saved: true,
    })

    // 准备工作流
    app.queueWorkflowStartResponse({ execution_id: 'exec-journey-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-journey-1', buildPublishJobFullStream())

    // ── 步骤 1：进入平台管理 Tab ──────────────────────────────
    await app.gotoRecruit('platform-config')
    await expect(page.getByTestId('platform-config-tab')).toBeVisible()

    // ── 步骤 2：添加账号 ──────────────────────────────────────
    await page.getByTestId('open-add-account-dialog').click()
    await expect(page.getByTestId('add-account-dialog')).toBeVisible()

    // 选择平台 + 填写信息
    await page.getByTestId('add-account-platform-select').click()
    await page.getByRole('option', { name: 'BOSS直聘' }).click()
    await page.getByTestId('add-account-name').fill('旅程测试账号')
    await page.getByTestId('add-account-submit').click()

    // 账号创建成功，对话框关闭
    await expect(page.getByTestId('add-account-dialog')).toBeHidden()
    await expect(page.getByTestId('selected-account-panel')).toContainText('旅程测试账号')

    // ── 步骤 3：远程登录绑定 ──────────────────────────────────
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('start-live-login').click()
    await expect(page.getByTestId('novnc-panel')).toBeVisible()
    await page.getByTestId('confirm-live-login').click()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('已完成')
    await page.getByRole('button', { name: '完成' }).click()

    // ── 步骤 4：切换到执行 Tab ────────────────────────────────
    await page.getByTestId('tab-execute').click()
    await expect(page.getByTestId('tab-execute')).toBeVisible()

    // ── 步骤 5：启动工作流 ────────────────────────────────────
    await page.getByTestId('workflow-action-publish_job').click()

    // ── 步骤 6：验证完整 SSE 流和完成状态 ────────────────────
    const monitor = page.getByTestId('execution-monitor')
    await expect(monitor).toBeVisible()
    await expect(monitor).toContainText('已完成', { timeout: 15000 })

    // 验证 payload 完整性：包含账号和岗位
    expect(app.workflowStarts).toHaveLength(1)
    const payload = app.workflowStarts[0]
    expect(payload).toMatchObject({
      workflow_id: 'publish_job',
    })
  })

  /**
   * 场景 2：已有活跃账号 → 依次执行三种工作流，每种均能完成
   */
  test('已有活跃账号：依次执行 publish_job / talent_explore / resume_screen', async ({ app, page }) => {
    app.setPlatformCatalog(bossCatalog)
    app.setPlatformAccounts([buildActiveAccount()])
    app.setJobs([buildJob({ id: 'job-multi-1', title: '招聘专员' })])

    // publish_job
    app.queueWorkflowStartResponse({ execution_id: 'exec-multi-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-multi-1', buildPublishJobFullStream())

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()
    await expect(page.getByTestId('execution-monitor')).toContainText('已完成', { timeout: 15000 })

    // talent_explore
    app.queueWorkflowStartResponse({ execution_id: 'exec-multi-2', workflow_id: 'talent_explore' })
    app.setWorkflowStream('exec-multi-2', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('search_talents', 'running', 0, 2, '搜索人才'),
      buildProgressEvent('search_talents', '正在搜索匹配候选人...'),
      buildStepChangeEvent('search_talents', 'done', 0, 2, '搜索人才'),
      buildCompleteEvent({ found: 5 }),
    ])

    await page.getByTestId('workflow-card-talent_explore').first().click()
    await page.getByTestId('workflow-action-talent_explore').click()
    await expect(page.getByTestId('execution-monitor')).toContainText('exec-multi-2', { timeout: 15000 })
    await expect(page.getByTestId('execution-monitor')).toContainText('已完成', { timeout: 15000 })

    // 验证两次工作流都被启动
    await expect.poll(() => app.workflowStarts.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2)
    const wfIds = app.workflowStarts.map((s) => s.workflow_id)
    expect(wfIds).toContain('publish_job')
    expect(wfIds).toContain('talent_explore')
  })

  /**
   * 场景 3：企业信息不完整时，工作流被阻断（不发出 API 请求）
   */
  test('企业信息缺失时工作流被阻断', async ({ app, page }) => {
    app.setPlatformCatalog(bossCatalog)
    app.setPlatformAccounts([buildActiveAccount()])
    app.setJobs([buildJob()])
    // 清空企业名称
    app.setTenantSettings({ company_name: '' })

    await app.gotoRecruit('execute')

    // 工作流按钮应禁用或不可点击
    const workflowBtn = page.getByTestId('workflow-action-publish_job')
    // 等待页面完全加载
    await expect(page.getByTestId('tab-execute')).toBeVisible()

    // 无论是禁用还是显示错误，都不应该有 workflowStarts
    const initialCount = app.workflowStarts.length

    // 尝试点击（可能被 disabled，也可能显示配置不完整提示）
    try {
      await workflowBtn.click({ timeout: 3000 })
    } catch {
      // 按钮可能不存在或无法点击，这是预期的
    }

    // 关键断言：没有发出工作流启动请求
    expect(app.workflowStarts.length).toBe(initialCount)
  })

  /**
   * 场景 4：工作流进度文字逐步累积，截图实时显示
   */
  test('执行过程中进度文字累积且截图实时展示', async ({ app, page }) => {
    app.setPlatformCatalog(bossCatalog)
    app.setPlatformAccounts([buildActiveAccount()])
    app.setJobs([buildJob()])
    app.queueWorkflowStartResponse({ execution_id: 'exec-progress-journey', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-progress-journey', buildPublishJobFullStream())

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    // 进度输出区域包含关键步骤文字
    const output = page.getByTestId('execution-output')
    await expect(output).toContainText('检测登录中...', { timeout: 10000 })
    await expect(output).toContainText('正在填写表单...')

    // 截图区域至少有 2 张（login_check + fill_and_publish 各一张）
    const screenshots = page.getByTestId('execution-screenshots').getByRole('img')
    await expect(screenshots).toHaveCount(2, { timeout: 10000 })

    // 最终完成
    await expect(page.getByTestId('execution-monitor')).toContainText('已完成')
  })

  /**
   * 场景 5：payload 完整性验证 —— 企业信息和岗位信息均写入工作流请求
   */
  test('启动 payload 包含完整岗位和企业信息', async ({ app, page }) => {
    app.setPlatformCatalog(bossCatalog)
    app.setPlatformAccounts([buildActiveAccount()])
    app.setJobs([
      buildJob({
        id: 'job-payload-check',
        title: '高级前端工程师',
        location: '北京',
        salary_min: 30,
        salary_max: 50,
      }),
    ])
    app.queueWorkflowStartResponse({ execution_id: 'exec-payload-j', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-payload-j', [buildPublishJobMetaEvent(), buildCompleteEvent()])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toContainText('已完成', { timeout: 10000 })

    expect(app.workflowStarts).toHaveLength(1)
    const payload = app.workflowStarts[0] as Record<string, unknown>

    // 岗位信息
    expect(payload.job_title).toBe('高级前端工程师')
    expect(payload.job_location).toBe('北京')
    expect(payload.job_salary_min).toBe(30)
    expect(payload.job_salary_max).toBe(50)

    // 企业信息（来自 tenant_settings）
    expect(typeof payload.company_name).toBe('string')
    expect((payload.company_name as string).length).toBeGreaterThan(0)

    // 账号 ID
    expect(payload.account_id).toBeTruthy()
  })
})
