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

function buildLiveSession(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 'live-login-1',
    ws_port: 6080,
    vnc_token: 'mock-token',
    ws_url: 'https://example.com/novnc/live-login-1',
    login_url: 'https://example.com/login/boss_zhipin',
    timeout_seconds: 600,
    ...overrides,
  }
}

async function selectRadixOption(page: import('@playwright/test').Page, triggerTestId: string, optionText: string) {
  await page.getByTestId(triggerTestId).click()
  await page.getByRole('option', { name: optionText }).click()
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
    await page.getByTestId('add-account-submit').click()

    await expect(page.getByText(/创建平台账号失败/)).toBeVisible()
    await expect(page.getByTestId('add-account-name')).toHaveValue('重复账号')

    await page.getByRole('button', { name: '取消' }).click()
    await page.getByTestId('open-add-account-dialog').click()
    await expect(page.getByTestId('add-account-name')).toHaveValue('')
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

  test('远程登录启动并确认成功后账号可复用', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueLiveLoginStartResponse(buildLiveSession({ session_id: 'live-bind-ok' }))
    app.queueLiveLoginConfirmResponse({
      is_logged_in: true,
      message: '登录状态已保存',
      workspace_saved: true,
      db_saved: true,
    })

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()

    await page.getByTestId('start-live-login').click()
    await expect(page.getByTestId('novnc-panel')).toBeVisible()
    await page.getByTestId('confirm-live-login').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('已完成')
    await expect(page.getByText('登录状态已保存')).toBeVisible()
    await page.getByRole('button', { name: '完成' }).click()
    await expect(page.getByTestId('platform-login-dialog')).toHaveCount(0)
    await expect(page.getByTestId('selected-account-panel')).toContainText('可直接复用')
  })

  test('远程登录确认失败时保留远程桌面并展示错误', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueLiveLoginStartResponse(buildLiveSession({ session_id: 'live-bind-retry' }))
    app.queueLiveLoginConfirmResponse({
      is_logged_in: false,
      message: '未检测到平台首页',
      persistence_detail: '请继续在远程桌面中完成登录',
    })

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('start-live-login').click()
    await page.getByTestId('confirm-live-login').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('待确认')
    await expect(page.getByText('未检测到平台首页')).toBeVisible()
    await expect(page.getByText('请继续在远程桌面中完成登录')).toBeVisible()
    await expect(page.getByTestId('novnc-panel')).toBeVisible()
  })

  test('远程登录停止后重新打开恢复到初始态', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueLiveLoginStartResponse(buildLiveSession({ session_id: 'live-bind-stop' }))

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('start-live-login').click()
    await page.getByTestId('stop-live-login').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('已停止')
    await page.getByRole('button', { name: '关闭' }).click()

    await page.getByTestId('open-bind-dialog').click()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('未开始')
    await expect(page.getByTestId('start-live-login')).toBeVisible()
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
    await expect(page.getByTestId('bind-status-badge')).toHaveText('已解绑')
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
