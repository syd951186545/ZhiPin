import { test, expect } from './fixtures/api'
import type { Page } from '@playwright/test'

function buildAccount(overrides: Record<string, unknown>) {
  return {
    id: 'account-1',
    name: 'BOSS 默认账号',
    platform: 'boss_zhipin',
    status: 'active',
    account_name: 'boss-admin',
    browser_session_key: 'session-1',
    latest_binding_session: null,
    ...overrides,
  }
}

function buildJob(overrides: Record<string, unknown>) {
  return {
    id: 'job-1',
    title: '前端工程师',
    location: '上海',
    salary_min: 20,
    salary_max: 35,
    employment_type: 'full-time',
    department: '技术部',
    description: '负责前端业务开发',
    requirements: '3 年以上 React 经验',
    benefits: '六险一金',
    ...overrides,
  }
}

async function selectPlatformValue(page: Page, cardTestId: string, fieldLabel: '执行账号' | '招聘岗位', optionText: string) {
  const platformKey = cardTestId.replace('execute-platform-card-', '')
  const triggerTestId =
    fieldLabel === '执行账号'
      ? `execute-account-select-${platformKey}`
      : `execute-job-select-${platformKey}`

  await page.getByTestId(triggerTestId).click()
  await page.getByRole('option', { name: optionText }).click()
}

test.describe('机灵招聘 - 招聘执行', () => {
  test('页面基础可用且后端断开时禁用执行按钮', async ({ app, page }) => {
    app.setHealth(false)
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
    ])
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([buildJob({ id: 'job-1' })])

    await app.gotoRecruit('execute')

    await expect(page.getByTestId('execute-tab')).toBeVisible()
    await expect(page.getByTestId('execute-platform-selection')).toBeVisible()
    await expect(page.getByTestId('workflow-card-publish_job')).toBeVisible()
    await expect(page.getByText('后端服务未连接，请确认 FastAPI 已启动。')).toBeVisible()
    await expect(page.getByTestId('workflow-action-publish_job')).toBeDisabled()
  })

  test('缺少岗位详情时阻止启动并给出错误', async ({ app, page }) => {
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
    ])
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueJobDetailError('加载岗位详情失败：record not found', 500)

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByText(/加载岗位详情失败/)).toBeVisible()
    await expect(app.workflowStarts).toHaveLength(0)
  })

  test('模板校验失败时阻止启动并提示配置问题', async ({ app, page }) => {
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
    ])
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([buildJob({ id: 'job-1' })])

    await page.route('**/api/workflow-templates/validate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: false,
          errors: ['模板校验失败：企业名称未配置，请先完善企业信息。'],
          normalized: {},
          template: null,
        }),
      })
    })

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByText('模板校验失败：企业名称未配置，请先完善企业信息。')).toBeVisible()
    await expect(app.workflowStarts).toHaveLength(0)
  })

  test('发布招聘公告成功链路渲染监控、截图和结果摘要', async ({ app, page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
    ])
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-publish-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-publish-1', [
      {
        event: 'workflow_meta',
        data: {
          workflow_id: 'publish_job',
          workflow_name: '发布招聘公告',
          steps: [
            { id: 'login_check', name_zh: '登录检查', requires_openclaw: true },
            { id: 'generate_announcement', name_zh: '生成招聘公告', requires_openclaw: true },
            { id: 'fill_and_publish', name_zh: '填写并发布', requires_openclaw: true },
            { id: 'verify_result', name_zh: '验证发布结果', requires_openclaw: true },
          ],
        },
      },
      { event: 'step_change', data: { step_id: 'login_check', step_name: '登录检查', status: 'running', step_index: 0, total_steps: 4 } },
      { event: 'progress', data: { step_id: 'login_check', delta: '检测登录中...', accumulated_text: '检测登录中...' } },
      { event: 'screenshot', data: { step_id: 'login_check', action: '登录检查', screenshot: '/api/openclaw/screenshot?ref=publish-1&sig=ok', timestamp: new Date().toISOString() } },
      { event: 'step_change', data: { step_id: 'login_check', step_name: '登录检查', status: 'done' } },
      { event: 'step_change', data: { step_id: 'generate_announcement', step_name: '生成招聘公告', status: 'running', step_index: 1, total_steps: 4 } },
      { event: 'progress', data: { step_id: 'generate_announcement', delta: '【AI公告内容】测试公告【/AI公告内容】', accumulated_text: '【AI公告内容】测试公告【/AI公告内容】' } },
      { event: 'step_change', data: { step_id: 'generate_announcement', step_name: '生成招聘公告', status: 'done' } },
      {
        event: 'complete',
        data: {
          announcement: '测试公告',
          publish_result: { status: '成功', url: 'https://example.com/job/1' },
          screenshots: ['/api/openclaw/screenshot?ref=publish-1&sig=ok'],
        },
      },
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toBeVisible()
    await expect(page.getByTestId('execution-output')).toContainText('测试公告')
    await expect(page.getByTestId('execution-screenshots').getByRole('img')).toHaveCount(1)
    await expect(page.getByTestId('execution-monitor')).toContainText('已完成')
    await expect(page.getByTestId('execution-monitor')).toHaveScreenshot('execute-publish-complete.png')

    expect(app.workflowStarts[0]).toMatchObject({
      workflow_id: 'publish_job',
      platform: 'boss_zhipin',
      account_id: 'account-1',
      job_id: 'job-1',
      job_title: '前端工程师',
      min_match_score: 60,
    })
  })

  test('artifact 事件可驱动截图展示与持久化状态更新', async ({ app, page }) => {
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
    ])
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-artifact-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-artifact-1', [
      {
        event: 'workflow_meta',
        data: {
          workflow_id: 'publish_job',
          workflow_name: '发布招聘公告',
          steps: [{ id: 'login_check', name_zh: '登录检查', requires_openclaw: true }],
        },
      },
      { event: 'step_change', data: { step_id: 'login_check', step_name: '登录检查', status: 'running', step_index: 0, total_steps: 1 } },
      {
        event: 'artifact_created',
        data: {
          artifact_id: 'artifact-1',
          run_id: 'exec-artifact-1',
          step_id: 'login_check',
          artifact_type: 'screenshot',
          source: 'openclaw_browser',
          capture_phase: 'after_action',
          mime_type: 'image/png',
          preview_url: '/api/openclaw/screenshot?ref=artifact-preview&sig=ok',
          live_url: '/api/openclaw/screenshot?ref=artifact-preview&sig=ok',
          captured_at: new Date().toISOString(),
          content_url: '/api/artifacts/artifact-1/content',
        },
      },
      {
        event: 'artifact_persisted',
        data: {
          artifact_id: 'artifact-1',
          run_id: 'exec-artifact-1',
          step_id: 'login_check',
          artifact_type: 'screenshot',
          source: 'openclaw_browser',
          capture_phase: 'after_action',
          mime_type: 'image/png',
          preview_url: '/api/openclaw/screenshot?ref=artifact-preview&sig=ok',
          live_url: '/api/openclaw/screenshot?ref=artifact-preview&sig=ok',
          signed_url: '/api/openclaw/screenshot?ref=artifact-signed&sig=ok',
          captured_at: new Date().toISOString(),
          content_url: '/api/artifacts/artifact-1/content',
        },
      },
      { event: 'complete', data: { screenshots: [] } },
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-screenshots').getByRole('img')).toHaveCount(1)
    await expect(page.getByTestId('execution-screenshots')).toContainText('已落库')
  })

  test('刷新后可从运行态接口恢复上次执行结果', async ({ app, page }) => {
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
    ])
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.setWorkflowRun('exec-replay-1', {
      execution_id: 'exec-replay-1',
      workflow_id: 'publish_job',
      workflow_name: '发布招聘公告',
      status: 'completed',
      multi_platform: false,
      step_order: ['login_check', 'fill_and_publish', 'verify_result'],
      steps: {
        login_check: { id: 'login_check', name_zh: '登录检查', status: 'done' },
        fill_and_publish: { id: 'fill_and_publish', name_zh: '填写并发布', status: 'done' },
        verify_result: { id: 'verify_result', name_zh: '验证发布结果', status: 'done' },
      },
      accumulated_output: '检测登录中...\n发布成功，职位链接已生成。',
      result: {
        announcement: '恢复用招聘公告',
        publish_result: { status: '成功', url: 'https://example.com/job/restore' },
      },
      artifacts_detail: [
        {
          artifact_id: 'artifact-replay-1',
          step_id: 'verify_result',
          capture_phase: 'after_action',
          captured_at: new Date().toISOString(),
          preview_url: '/api/openclaw/screenshot?ref=replay-preview&sig=ok',
          signed_url: '/api/openclaw/screenshot?ref=replay-signed&sig=ok',
          content_url: '/api/artifacts/artifact-replay-1/content',
        },
      ],
    })

    await app.gotoRecruit('execute')
    await page.evaluate(() => {
      window.localStorage.setItem('jiling-recruit:last-execution-id', 'exec-replay-1')
    })
    await page.reload()
    await page.getByTestId('tab-execute').click()

    await expect(page.getByTestId('execution-monitor')).toBeVisible()
    await expect(page.getByTestId('execution-monitor')).toContainText('发布招聘公告')
    await expect(page.getByTestId('execution-monitor')).toContainText('已完成')
    await expect(page.getByTestId('execution-output')).toContainText('职位链接已生成')
    await expect(page.getByTestId('execution-screenshots').getByRole('img')).toHaveCount(1)
  })

  test('多平台简历筛选任务上送正确 payload，并正确处理平台切换与截图去重', async ({ app, page }) => {
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
      {
        key: 'zhilian',
        name: '智联招聘',
        enterprise_url: 'https://i.zhaopin.com/',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'password'],
      },
    ])
    app.setPlatformAccounts([
      buildAccount({ id: 'account-1', platform: 'boss_zhipin', name: 'BOSS 默认账号' }),
      buildAccount({ id: 'account-2', platform: 'zhilian', name: '智联默认账号', account_name: 'zl-admin', browser_session_key: 'session-2' }),
    ])
    app.setJobs([buildJob({ id: 'job-1' }), buildJob({ id: 'job-2', title: '后端工程师' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-resume-1', workflow_id: 'resume_screen' })
    app.setWorkflowStream('exec-resume-1', [
      {
        event: 'workflow_meta',
        data: {
          workflow_id: 'resume_screen',
          workflow_name: '简历筛选及AI沟通',
          multi_platform: true,
          steps: [
            { id: 'login_check_boss_zhipin', name_zh: '[BOSS直聘] 登录平台', requires_openclaw: true, platform: 'boss_zhipin' },
            { id: 'login_check_zhilian', name_zh: '[智联招聘] 登录平台', requires_openclaw: true, platform: 'zhilian' },
          ],
        },
      },
      { event: 'platform_change', data: { platform: 'boss_zhipin', platform_name: 'BOSS直聘', platform_index: 0, total_platforms: 2 } },
      { event: 'step_change', data: { step_id: 'login_check_boss_zhipin', step_name: '[BOSS直聘] 登录平台', status: 'running', step_index: 0, total_steps: 2 } },
      { event: 'screenshot', data: { step_id: 'login_check_boss_zhipin', action: '[BOSS直聘] 登录平台', screenshot: '/api/openclaw/screenshot?ref=dup&sig=ok', timestamp: new Date().toISOString() } },
      { event: 'screenshot', data: { step_id: 'login_check_boss_zhipin', action: '[BOSS直聘] 登录平台', screenshot: '/api/openclaw/screenshot?ref=dup&sig=ok', timestamp: new Date().toISOString() } },
      { event: 'platform_change', data: { platform: 'zhilian', platform_name: '智联招聘', platform_index: 1, total_platforms: 2 } },
      { event: 'complete', data: { result_summary: { candidates_found: 3, candidates_saved: 2 }, screenshots: ['/api/openclaw/screenshot?ref=dup&sig=ok'] } },
    ])

    await app.gotoRecruit('execute')
    await selectPlatformValue(page, 'execute-platform-card-boss_zhipin', '执行账号', 'BOSS 默认账号')
    await selectPlatformValue(page, 'execute-platform-card-boss_zhipin', '招聘岗位', '前端工程师')
    await selectPlatformValue(page, 'execute-platform-card-zhilian', '执行账号', '智联默认账号')
    await selectPlatformValue(page, 'execute-platform-card-zhilian', '招聘岗位', '后端工程师')

    await page.getByTestId('workflow-action-resume_screen').click()

    await expect(page.getByTestId('execution-monitor')).toContainText('简历筛选及AI沟通')
    await expect(page.getByTestId('execution-screenshots').getByRole('img')).toHaveCount(1)

    expect(app.workflowStarts[0]).toMatchObject({
      workflow_id: 'resume_screen',
      platforms: ['boss_zhipin', 'zhilian'],
      platform_account_ids: {
        boss_zhipin: 'account-1',
        zhilian: 'account-2',
      },
    })
  })

  test('执行中可主动停止并发送取消请求', async ({ app, page }) => {
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
    ])
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-cancel-1', workflow_id: 'publish_job' })

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()
    await page.getByTestId('workflow-action-publish_job').click()

    await expect.poll(() => app.cancelRequests.join(',')).toContain('exec-cancel-1')
    await expect(page.getByTestId('workflow-action-publish_job')).toContainText('开始执行')
  })

  test('executionId 返回前立即停止也会在返回后补发取消', async ({ app, page }) => {
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
    ])
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([buildJob({ id: 'job-1' })])

    await page.route('**/api/workflow/start', async (route) => {
      app.workflowStarts.push(JSON.parse(route.request().postData() || '{}'))
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ execution_id: 'exec-delayed-1', workflow_id: 'publish_job' }),
      })
    })

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()
    await page.getByTestId('workflow-action-publish_job').click()

    await expect.poll(() => app.cancelRequests.join(',')).toContain('exec-delayed-1')
  })

  test('工作流失败时保留错误和已有截图', async ({ app, page }) => {
    app.setPlatformCatalog([
      {
        key: 'boss_zhipin',
        name: 'BOSS直聘',
        enterprise_url: 'https://www.zhipin.com/web/geek/job',
        recommended_login_method: 'phone',
        supported_login_methods: ['phone', 'qr'],
      },
    ])
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-fail-1', workflow_id: 'talent_explore' })
    app.setWorkflowStream('exec-fail-1', [
      {
        event: 'workflow_meta',
        data: {
          workflow_id: 'talent_explore',
          workflow_name: '市场人才探索',
          steps: [{ id: 'login_check', name_zh: '登录平台', requires_openclaw: true }],
        },
      },
      { event: 'screenshot', data: { step_id: 'login_check', action: '登录平台', screenshot: '/api/openclaw/screenshot?ref=err&sig=ok', timestamp: new Date().toISOString() } },
      { event: 'error', data: { step_id: 'login_check', message: '平台登录失效，请重新绑定' } },
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-talent_explore').click()

    await expect(page.getByTestId('execution-monitor')).toContainText('平台登录失效，请重新绑定')
    await expect(page.getByTestId('execution-screenshots').getByRole('img')).toHaveCount(1)
  })
})
