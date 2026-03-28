/**
 * 平台配置 - 解绑、验证、删除边界测试。
 *
 * @platform-config
 */

import { test, expect } from '../fixtures/api'
import { buildAccount, buildBindingSession } from '../helpers/builders'
import { transparentPngDataUrl } from '../helpers/sse'

test.describe('平台配置 - 解绑验证删除 @platform-config', () => {
  test('验证登录成功 - 状态变为已完成', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({
        id: 'account-1',
        status: 'active',
        latest_binding_session: buildBindingSession({
          id: 'bind-ok',
          status: 'completed',
          latest_screenshot_url: transparentPngDataUrl,
        }),
      }),
    ])
    app.queueVerifyResponse(
      buildBindingSession({ id: 'verify-ok', action: 'verify', status: 'completed' }),
    )

    await app.gotoRecruit('platform-config')
    await page.getByTestId('verify-account').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('已完成')
  })

  test('验证登录失败 - 状态变为已过期', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({
        id: 'account-1',
        status: 'active',
        latest_binding_session: buildBindingSession({
          id: 'bind-ok',
          status: 'completed',
          latest_screenshot_url: transparentPngDataUrl,
        }),
      }),
    ])
    app.queueVerifyResponse(
      buildBindingSession({
        id: 'verify-fail',
        action: 'verify',
        status: 'failed',
        error_message: '登录状态已过期',
      }),
    )
    app.setBindingStream('verify-fail', [
      {
        event: 'state',
        data: { status: 'failed', reason: '登录状态已过期', latest_screenshot: transparentPngDataUrl },
      },
    ])

    await app.gotoRecruit('platform-config')
    await page.getByTestId('verify-account').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('验证失败')
  })

  test('解绑成功后状态变为待绑定', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({
        id: 'account-1',
        status: 'active',
        latest_binding_session: buildBindingSession({
          id: 'bind-ok',
          status: 'completed',
          latest_screenshot_url: transparentPngDataUrl,
        }),
      }),
    ])
    app.queueUnbindResponse(
      buildBindingSession({ id: 'unbind-ok', action: 'unbind', status: 'completed' }),
    )

    await app.gotoRecruit('platform-config')
    await page.getByTestId('unbind-account').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()
    await expect(page.getByTestId('bind-status-badge')).toHaveText('已解绑')
    await page.getByRole('button', { name: '关闭' }).click()

    // 解绑完成后账号状态回到 needsLogin，绑定按钮应可用
    await expect(page.getByTestId('open-bind-dialog')).toBeVisible()
  })

  test('解绑对话框关闭不改变账号状态', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({
        id: 'account-1',
        status: 'active',
        latest_binding_session: buildBindingSession({
          id: 'bind-ok',
          status: 'completed',
          latest_screenshot_url: transparentPngDataUrl,
        }),
      }),
    ])

    await app.gotoRecruit('platform-config')

    // 打开解绑对话框后直接关闭，不执行操作
    await page.getByTestId('unbind-account').click()
    await expect(page.getByTestId('platform-login-dialog')).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    // 账号仍应保持 active 状态，解绑按钮仍可用
    await expect(page.getByTestId('unbind-account')).toBeVisible()
  })

  test('删除确认弹窗取消保留账号', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({ id: 'account-1', status: 'active' }),
    ])

    await app.gotoRecruit('platform-config')

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByTestId('account-actions-account-1').click()
    await page.getByTestId('account-delete-account-1').click()

    // 取消后账号行仍在
    await expect(page.getByTestId('account-row-account-1')).toBeVisible()
  })

  test('删除确认弹窗确认移除账号', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({ id: 'account-1', status: 'active' }),
      buildAccount({ id: 'account-2', name: '备用账号', status: 'needsLogin' }),
    ])

    await app.gotoRecruit('platform-config')

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByTestId('account-actions-account-1').click()
    await page.getByTestId('account-delete-account-1').click()

    // 确认后该账号被移除
    await expect(page.getByTestId('account-row-account-1')).toHaveCount(0)
    // 另一个账号仍在
    await expect(page.getByTestId('account-row-account-2')).toBeVisible()
  })

  test('删除失败保留账号并显示错误', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({ id: 'account-1', status: 'active' }),
    ])
    app.queueDeleteAccountError('删除账号失败：存在关联任务')

    await app.gotoRecruit('platform-config')

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByTestId('account-actions-account-1').click()
    await page.getByTestId('account-delete-account-1').click()

    // 删除失败后账号仍在
    await expect(page.getByTestId('account-row-account-1')).toBeVisible()
    await expect(page.getByText(/删除账号失败/)).toBeVisible()
  })

  test('删除平台唯一账号后显示空状态', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      buildAccount({ id: 'account-1', status: 'needsLogin' }),
    ])

    await app.gotoRecruit('platform-config')
    await expect(page.getByTestId('account-row-account-1')).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByTestId('account-actions-account-1').click()
    await page.getByTestId('account-delete-account-1').click()

    await expect(page.getByTestId('account-row-account-1')).toHaveCount(0)
    await expect(page.getByText('当前平台暂无账号')).toBeVisible()
  })
})
