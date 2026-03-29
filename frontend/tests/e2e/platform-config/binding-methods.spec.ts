/**
 * 平台配置 - 远程登录弹窗异常路径测试。
 *
 * @platform-config
 */

import { test, expect } from '../fixtures/api'
import { buildAccount } from '../helpers/builders'

function buildLiveSession(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 'live-login-1',
    ws_port: 6080,
    ws_url: 'https://example.com/novnc/live-login-1',
    login_url: 'https://example.com/login/boss_zhipin',
    timeout_seconds: 600,
    ...overrides,
  }
}

test.describe('平台配置 - 远程登录弹窗 @platform-config', () => {
  test('启动远程登录失败时显示错误', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueLiveLoginStartError('远程桌面服务暂不可用', 500)

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('start-live-login').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('异常')
    await expect(page.getByText('远程桌面服务暂不可用')).toBeVisible()
  })

  test('启动远程登录后显示 noVNC 面板与确认按钮', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueLiveLoginStartResponse(buildLiveSession())

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('start-live-login').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('待确认')
    await expect(page.getByTestId('novnc-panel')).toBeVisible()
    await expect(page.getByTestId('confirm-live-login')).toBeVisible()
    await expect(page.getByTestId('stop-live-login')).toBeVisible()
  })

  test('确认已登录成功后显示完成状态', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueLiveLoginStartResponse(buildLiveSession({ session_id: 'live-confirm-ok' }))
    app.queueLiveLoginConfirmResponse({
      is_logged_in: true,
      message: '登录状态已保存',
      workspace_saved: true,
      db_saved: true,
    })

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('start-live-login').click()
    await page.getByTestId('confirm-live-login').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('已完成')
    await expect(page.getByText('登录成功')).toBeVisible()
    await expect(page.getByText('登录状态已保存')).toBeVisible()
  })

  test('确认已登录但系统未检测到登录态时保留运行态并展示错误', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueLiveLoginStartResponse(buildLiveSession({ session_id: 'live-confirm-fail' }))
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

  test('停止远程登录后展示已停止状态并允许重新启动', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueLiveLoginStartResponse(buildLiveSession({ session_id: 'live-stop-1' }))

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('start-live-login').click()
    await page.getByTestId('stop-live-login').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('已停止')
    await expect(page.getByTestId('start-live-login')).toBeVisible()
    await expect(page.getByText('当前会话已停止')).toBeVisible()
  })

  test('远程登录会话超时后显示过期状态', async ({ app, page }) => {
    const sessionId = 'live-expired-1'
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueLiveLoginStartResponse(buildLiveSession({ session_id: sessionId, timeout_seconds: 10 }))

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('start-live-login').click()

    app.setLiveLoginStatus(sessionId, {
      session_id: sessionId,
      active: false,
      time_remaining: 0,
    })

    await page.waitForTimeout(5500)
    await expect(page.getByTestId('bind-status-badge')).toHaveText('已过期')
    await expect(page.getByText('登录会话已超时，请重新开始')).toBeVisible()
  })
})
