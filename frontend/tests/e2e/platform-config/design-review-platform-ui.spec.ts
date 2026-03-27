import {test, expect} from '../fixtures/api'

function buildBindingSession(overrides: Record<string, unknown>) {
  return {
    id: 'binding-1',
    account_id: 'account-1',
    tenant_id: 'tenant-1',
    action: 'verify',
    status: 'completed',
    step_key: 'VERIFY_DONE',
    latest_screenshot_url: '/api/openclaw/screenshot?ref=active&sig=ok',
    qr_screenshot_url: null,
    error_message: null,
    output_text: '最近一次验证通过，企业端主页可访问。',
    openclaw_session_key: 'ocl-1',
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function buildAccount(overrides: Record<string, unknown>) {
  return {
    id: 'account-1',
    name: '华东招聘账号',
    platform: 'boss_zhipin',
    status: 'active',
    account_name: '138****0000',
    browser_session_key: 'session-active-001',
    latest_binding_session: buildBindingSession({}),
    ...overrides,
  }
}

test.describe('平台配置设计梳理回归', () => {
  test('平台卡片、账号卡片与绑定/验证弹窗状态保持统一', async ({app, page}) => {
    app.setJobs([{id: 'job-1', title: '前端工程师'}])
    app.setPlatformAccounts([
      buildAccount({id: 'account-1'}),
      buildAccount({
        id: 'account-2',
        name: '华南招聘账号',
        status: 'expired',
        account_name: 'boss-admin',
        browser_session_key: 'session-expired-002',
        latest_binding_session: buildBindingSession({
          id: 'verify-expired-1',
          account_id: 'account-2',
          status: 'failed',
          error_message: '企业端提示登录已过期',
          output_text: '验证失败，平台要求重新登录。',
        }),
      }),
      buildAccount({
        id: 'account-3',
        name: '智联账号',
        platform: 'zhilian',
        status: 'needsLogin',
        account_name: 'zl-admin',
        browser_session_key: '',
        latest_binding_session: null,
      }),
    ])

    app.queueVerifyResponse(buildBindingSession({
      id: 'verify-dialog-1',
      account_id: 'account-1',
      action: 'verify',
      status: 'completed',
      output_text: '验证完成，页面结构稳定。',
    }))
    app.queueUnbindResponse(buildBindingSession({
      id: 'unbind-dialog-1',
      account_id: 'account-1',
      action: 'unbind',
      status: 'completed',
      output_text: '解绑完成，登录态已清理。',
    }))

    await app.gotoRecruit('platform-config')

    await expect(page.getByTestId('platform-card-boss_zhipin')).toContainText('已有可用登录态')
    await expect(page.getByTestId('platform-card-boss_zhipin')).toContainText('当前查看')
    await expect(page.getByTestId('selected-account-panel')).toContainText('可直接复用')
    await expect(page.getByTestId('selected-account-panel')).toContainText('浏览器会话键')
    await expect(page.getByTestId('verify-account')).toBeVisible()
    await expect(page.getByTestId('unbind-account')).toBeVisible()

    await page.getByTestId('verify-account').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()
    await expect(page.getByTestId('platform-action-dialog')).toBeVisible()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('已完成')
    await page.getByRole('button', {name: '关闭'}).click()

    await page.getByTestId('unbind-account').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()
    await expect(page.getByTestId('platform-action-dialog')).toBeVisible()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('已解绑')
    await page.getByRole('button', {name: '关闭'}).click()

    await page.getByText('华南招聘账号').click()
    await expect(page.getByTestId('selected-account-panel')).toContainText('需要先绑定')
    await expect(page.getByTestId('rebind-account')).toBeVisible()

    await page.getByTestId('platform-card-zhilian').click()
    await expect(page.getByTestId('selected-account-panel')).toContainText('需要先绑定')
    await expect(page.getByTestId('open-bind-dialog')).toBeVisible()
    await page.getByTestId('open-bind-dialog').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('未开始')
    await expect(page.getByTestId('start-live-login')).toBeVisible()
  })
})
