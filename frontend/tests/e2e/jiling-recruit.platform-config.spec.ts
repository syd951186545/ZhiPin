import { test, expect } from './fixtures/api'
import { transparentPngDataUrl } from './helpers/sse'

function buildAccount(overrides: Record<string, unknown>) {
  return {
    id: 'account-1',
    name: '华东招聘账号',
    platform: 'boss_zhipin',
    status: 'needsLogin',
    account_name: '13800000000',
    browser_session_key: 'session-1',
    latest_binding_session: null,
    ...overrides,
  }
}

function buildBindingSession(overrides: Record<string, unknown>) {
  return {
    id: 'binding-1',
    account_id: 'account-1',
    tenant_id: 'tenant-1',
    action: 'bind',
    status: 'running',
    step_key: 'INIT',
    latest_screenshot_url: null,
    qr_screenshot_url: null,
    error_message: null,
    ...overrides,
  }
}

async function selectRadixOption(page: import('@playwright/test').Page, triggerTestId: string, optionText: string) {
  await page.getByTestId(triggerTestId).click()
  await page.getByRole('option', { name: optionText }).click()
}

async function startBind(page: import('@playwright/test').Page) {
  const button = page.getByTestId('start-bind')
  await button.scrollIntoViewIfNeeded()
  await button.click()
}

test.describe('机灵招聘 - 平台和账号配置', () => {
  test('页面基础可用且后端异常时展示告警', async ({ app, page }) => {
    app.setHealth(false)
    app.setPlatformAccounts([buildAccount({ id: 'account-1' })])
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])

    await app.gotoRecruit('platform-config')

    await expect(page.getByTestId('platform-config-tab')).toBeVisible()
    await expect(page.getByTestId('platform-catalog-panel')).toBeVisible()
    await expect(page.getByTestId('account-task-panel')).toBeVisible()
    await expect(page.getByText('后端服务未连接，请确认 FastAPI 已启动。')).toBeVisible()
  })

  test('新增账号成功并展示平台预览', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])

    await app.gotoRecruit('platform-config')

    await page.getByTestId('open-add-account-dialog').click()
    await expect(page.getByTestId('add-account-dialog')).toBeVisible()
    await expect(page.getByTestId('add-account-submit')).toBeDisabled()

    await selectRadixOption(page, 'add-account-platform-select', 'BOSS直聘')
    await expect(page.getByTestId('add-account-platform-preview')).toContainText('BOSS直聘')
    await page.getByTestId('add-account-name').fill('新建招聘账号')
    await page.getByTestId('add-account-login-name').fill('hr-boss')
    await page.getByTestId('add-account-submit').click()

    await expect(page.getByTestId('add-account-dialog')).toBeHidden()
    await expect(page.getByTestId('selected-account-panel')).toContainText('新建招聘账号')
    await expect(page.getByText('当前平台暂无账号')).toHaveCount(0)
  })

  test('新增账号失败时保留表单并在重新打开后重置', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.queueCreateAccountError('创建平台账号失败 (500): duplicate')

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-add-account-dialog').click()

    await selectRadixOption(page, 'add-account-platform-select', 'BOSS直聘')
    await page.getByTestId('add-account-name').fill('重复账号')
    await page.getByTestId('add-account-login-name').fill('dupe')
    await page.getByTestId('add-account-submit').click()

    await expect(page.getByText(/创建平台账号失败/)).toBeVisible()
    await expect(page.getByTestId('add-account-name')).toHaveValue('重复账号')

    await page.getByRole('button', { name: '取消' }).click()
    await page.getByTestId('open-add-account-dialog').click()
    await expect(page.getByTestId('add-account-name')).toHaveValue('')
    await expect(page.getByTestId('add-account-login-name')).toHaveValue('')
  })

  test('平台切换和默认账号切换保持正确', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({ id: 'account-1', name: '华东招聘账号', platform: 'boss_zhipin', status: 'active' }),
      buildAccount({ id: 'account-2', name: '华南招聘账号', platform: 'boss_zhipin', status: 'active' }),
      buildAccount({ id: 'account-3', name: '智联账号', platform: 'zhilian', status: 'active', account_name: 'zhaopin-user' }),
    ])

    await app.gotoRecruit('platform-config')

    await expect(page.getByTestId('selected-account-panel')).toContainText('华东招聘账号')
    await selectRadixOption(page, 'default-account-select', '华南招聘账号')
    await expect(page.getByTestId('selected-account-panel')).toContainText('华南招聘账号')

    await page.getByTestId('platform-card-zhilian').click()
    await expect(page.getByTestId('selected-account-panel')).toContainText('智联账号')

    await page.getByTestId('platform-card-boss_zhipin').click()
    await expect(page.getByTestId('selected-account-panel')).toContainText('华南招聘账号')
  })

  test('手机号绑定支持等待验证码、日志过滤和提交成功', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])

    app.queueBindStartResponse(buildBindingSession({ id: 'bind-phone-1', status: 'running' }))
    app.setBindingStream('bind-phone-1', [
      {
        event: 'progress',
        data: {
          accumulated_text: '请填写验证码\n![二维码](https://example.com/a.png)\n[LOGIN_STATE:AWAIT_SMS]\n[LOGIN_REASON:等待短信验证码]',
          latest_screenshot: '/api/openclaw/screenshot?ref=phone-1&sig=ok',
        },
      },
      {
        event: 'state',
        data: {
          status: 'awaiting_sms',
          reason: '等待短信验证码',
          latest_screenshot: '/api/openclaw/screenshot?ref=phone-1&sig=ok',
        },
      },
    ])
    app.queueBindSubmitResponse(
      buildBindingSession({
        id: 'bind-phone-2',
        status: 'completed',
        latest_screenshot_url: '/api/openclaw/screenshot?ref=phone-2&sig=ok',
        error_message: null,
      }),
    )

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()

    await page.getByTestId('bind-phone-input').fill('13800000000')
    await startBind(page)

    await expect(page.getByTestId('bind-progress-log')).toContainText('请填写验证码')
    await expect(page.getByTestId('bind-progress-log')).not.toContainText('[LOGIN_STATE:')
    await expect(page.getByText('提交验证')).toBeVisible()
    await expect(page.getByTestId('bind-screenshot-panel')).toHaveScreenshot('platform-bind-awaiting-sms.png')

    await page.getByTestId('bind-verification-code-input').fill('123456')
    await page.getByTestId('submit-bind-verification').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('已完成')
    await expect(page.getByTestId('selected-account-panel')).toContainText('最近成功')
    await expect(page.getByTestId('latest-account-screenshot')).toBeVisible()
  })

  test('扫码绑定支持二维码刷新且替换截图', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({
        id: 'account-1',
        platform: 'boss_zhipin',
        latest_binding_session: buildBindingSession({
          id: 'bind-qr-existing',
          status: 'awaiting_qr',
          latest_screenshot_url: '/api/openclaw/screenshot?ref=old&sig=ok',
          qr_screenshot_url: '/api/openclaw/screenshot?ref=old&sig=ok',
        }),
      }),
    ])
    app.queueBindStartResponse(buildBindingSession({ id: 'bind-qr-1', status: 'running' }))
    app.setBindingStream('bind-qr-1', [
      {
        event: 'state',
        data: {
          status: 'awaiting_qr',
          reason: '请扫码登录',
          latest_screenshot: '/api/openclaw/screenshot?ref=old&sig=ok',
        },
      },
    ])
    app.setRefreshQrResponse('bind-qr-1', '/api/openclaw/screenshot?ref=new&sig=ok')

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-method-qr').click()
    await startBind(page)

    const shot = page.getByAltText('当前页面截图')
    await expect(shot).toHaveAttribute('src', /ref=old/)
    await page.getByTestId('refresh-qr-button').click()
    await expect(shot).toHaveAttribute('src', /ref=new/)
    await expect(page.getByTestId('bind-screenshot-panel')).toHaveScreenshot('platform-bind-awaiting-qr.png')
  })

  test('账号密码绑定支持二次验证并完成', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueBindStartResponse(buildBindingSession({ id: 'bind-password-1', status: 'running' }))
    app.setBindingStream('bind-password-1', [
      {
        event: 'state',
        data: {
          status: 'awaiting_password_2fa',
          reason: '请输入二次验证信息',
          latest_screenshot: transparentPngDataUrl,
        },
      },
    ])
    app.queueBindSubmitResponse(
      buildBindingSession({
        id: 'bind-password-2',
        status: 'completed',
        latest_screenshot_url: transparentPngDataUrl,
      }),
    )

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-method-password').click()

    await expect(page.getByTestId('start-bind')).toBeDisabled()
    await page.getByTestId('bind-login-name-input').fill('boss-admin')
    await page.getByTestId('bind-password-input').fill('secret')
    await startBind(page)

    await expect(page.getByTestId('bind-secondary-code-input')).toBeVisible()
    await page.getByTestId('bind-secondary-code-input').fill('654321')
    await page.getByTestId('bind-secondary-password-input').fill('2fa-secret')
    await page.getByTestId('submit-bind-verification').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('已完成')
    await expect(page.getByTestId('selected-account-panel')).toContainText('最近成功')
  })

  test('绑定失败后重新打开仍保留最近失败状态和截图', async ({ app, page }) => {
    const failedSession = buildBindingSession({
      id: 'bind-failed-1',
      status: 'failed',
      error_message: '短信验证码错误',
      latest_screenshot_url: '/api/openclaw/screenshot?ref=failed&sig=ok',
    })

    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({
        id: 'account-1',
        status: 'needsLogin',
        latest_binding_session: failedSession,
      }),
    ])

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('失败')
    await expect(page.getByText('短信验证码错误')).toBeVisible()
    await expect(page.getByAltText('当前页面截图')).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    await page.getByTestId('open-bind-dialog').click()
    await expect(page.getByText('短信验证码错误')).toBeVisible()
  })

  test('验证登录、解绑和删除账号链路可用', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({
        id: 'account-1',
        status: 'active',
        latest_binding_session: buildBindingSession({
          id: 'bind-ok-1',
          status: 'completed',
          latest_screenshot_url: transparentPngDataUrl,
        }),
      }),
    ])
    app.queueVerifyResponse(buildBindingSession({ id: 'verify-1', action: 'verify', status: 'completed' }))
    app.queueUnbindResponse(buildBindingSession({ id: 'unbind-1', action: 'unbind', status: 'completed' }))

    await app.gotoRecruit('platform-config')

    await page.getByTestId('verify-account').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('已完成')
    await page.getByRole('button', { name: '关闭' }).click()

    await page.getByTestId('unbind-account').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('已完成')
    await page.getByRole('button', { name: '关闭' }).click()

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByTestId('account-actions-account-1').click()
    await page.getByTestId('account-delete-account-1').click()
    await expect(page.getByTestId('account-row-account-1')).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByTestId('account-actions-account-1').click()
    await page.getByTestId('account-delete-account-1').click()
    await expect(page.getByTestId('account-row-account-1')).toHaveCount(0)
  })
})
