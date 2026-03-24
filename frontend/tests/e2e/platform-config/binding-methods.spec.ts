/**
 * 平台配置 - 绑定方法异常路径测试。
 *
 * @platform-config
 */

import { test, expect } from '../fixtures/api'
import { startBind } from '../helpers/assertions'
import { buildAccount, buildBindingSession } from '../helpers/builders'
import { transparentPngDataUrl } from '../helpers/sse'

test.describe('平台配置 - 绑定方法异常路径 @platform-config', () => {
  test('手机号绑定 - 错误验证码导致绑定失败', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])

    app.queueBindStartResponse(buildBindingSession({ id: 'bind-fail-1', status: 'running' }))
    app.setBindingStream('bind-fail-1', [
      {
        event: 'state',
        data: { status: 'awaiting_sms', reason: '等待验证码', latest_screenshot: transparentPngDataUrl },
      },
    ])
    app.queueBindSubmitResponse(
      buildBindingSession({ id: 'bind-fail-2', status: 'failed', error_message: '验证码错误，请重试' }),
    )

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-phone-input').fill('13800000000')
    await startBind(page)

    await expect(page.getByText('提交验证')).toBeVisible()
    await page.getByTestId('bind-verification-code-input').fill('000000')
    await page.getByTestId('submit-bind-verification').click()

    await expect(page.getByTestId('bind-status-badge')).toHaveText('失败')
    await expect(page.getByText('验证码错误')).toBeVisible()
  })

  test('手机号绑定 - 空验证码无法提交', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])

    app.queueBindStartResponse(buildBindingSession({ id: 'bind-empty-1', status: 'running' }))
    app.setBindingStream('bind-empty-1', [
      {
        event: 'state',
        data: { status: 'awaiting_sms', reason: '等待验证码', latest_screenshot: transparentPngDataUrl },
      },
    ])

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-phone-input').fill('13800000000')
    await startBind(page)

    await expect(page.getByText('提交验证')).toBeVisible()
    // 不填验证码，提交按钮应禁用
    await expect(page.getByTestId('submit-bind-verification')).toBeDisabled()
  })

  test('扫码绑定 - 多次刷新二维码连续替换截图', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])

    app.queueBindStartResponse(buildBindingSession({ id: 'bind-qr-multi', status: 'running' }))
    app.setBindingStream('bind-qr-multi', [
      {
        event: 'state',
        data: {
          status: 'awaiting_qr',
          reason: '请扫码登录',
          latest_screenshot: '/api/openclaw/screenshot?ref=qr-v1&sig=ok',
        },
      },
    ])

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-method-qr').click()
    await startBind(page)

    const shot = page.getByAltText('当前页面截图')
    await expect(shot).toHaveAttribute('src', /ref=qr-v1/)

    // 第一次刷新
    app.setRefreshQrResponse('bind-qr-multi', '/api/openclaw/screenshot?ref=qr-v2&sig=ok')
    await page.getByTestId('refresh-qr-button').click()
    await expect(shot).toHaveAttribute('src', /ref=qr-v2/)

    // 第二次刷新
    app.setRefreshQrResponse('bind-qr-multi', '/api/openclaw/screenshot?ref=qr-v3&sig=ok')
    await page.getByTestId('refresh-qr-button').click()
    await expect(shot).toHaveAttribute('src', /ref=qr-v3/)
  })

  test('扫码绑定 - 扫码超时后仍可刷新', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])

    app.queueBindStartResponse(buildBindingSession({ id: 'bind-qr-timeout', status: 'running' }))
    app.setBindingStream('bind-qr-timeout', [
      {
        event: 'state',
        data: {
          status: 'awaiting_qr',
          reason: '二维码已超时，请点击刷新',
          latest_screenshot: '/api/openclaw/screenshot?ref=expired&sig=ok',
        },
      },
    ])
    app.setRefreshQrResponse('bind-qr-timeout', '/api/openclaw/screenshot?ref=refreshed&sig=ok')

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-method-qr').click()
    await startBind(page)

    await expect(page.getByTestId('refresh-qr-button')).toBeVisible()
    await expect(page.getByTestId('refresh-qr-button')).toBeEnabled()
  })

  test('密码绑定 - 凭据错误返回失败', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])

    app.queueBindStartResponse(buildBindingSession({ id: 'bind-pw-fail', status: 'running' }))
    app.setBindingStream('bind-pw-fail', [
      {
        event: 'state',
        data: { status: 'failed', reason: '密码错误，请检查后重试', latest_screenshot: transparentPngDataUrl },
      },
    ])

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-method-password').click()
    await page.getByTestId('bind-login-name-input').fill('admin')
    await page.getByTestId('bind-password-input').fill('wrongpass')
    await startBind(page)

    await expect(page.getByTestId('bind-status-badge')).toHaveText('失败')
    await expect(page.getByText('密码错误')).toBeVisible()
  })

  test('密码绑定 - 二次验证字段可见', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])

    app.queueBindStartResponse(buildBindingSession({ id: 'bind-2fa', status: 'running' }))
    app.setBindingStream('bind-2fa', [
      {
        event: 'state',
        data: {
          status: 'awaiting_password_2fa',
          reason: '请输入二次验证信息',
          latest_screenshot: transparentPngDataUrl,
        },
      },
    ])

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-method-password').click()
    await page.getByTestId('bind-login-name-input').fill('admin')
    await page.getByTestId('bind-password-input').fill('secret')
    await startBind(page)

    await expect(page.getByTestId('bind-secondary-code-input')).toBeVisible()
    await expect(page.getByTestId('bind-secondary-password-input')).toBeVisible()
  })

  test('绑定启动 API 返回 500 时显示错误', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.queueBindStartError('绑定服务暂不可用', 500)

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-phone-input').fill('13800000000')
    await startBind(page)

    await expect(page.getByText(/绑定服务暂不可用|绑定失败|错误/)).toBeVisible()
  })

  test('绑定过程中日志正确过滤系统标记', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])

    app.queueBindStartResponse(buildBindingSession({ id: 'bind-log-filter', status: 'running' }))
    app.setBindingStream('bind-log-filter', [
      {
        event: 'progress',
        data: {
          accumulated_text:
            '正在登录平台\n![截图](https://example.com/a.png)\n[LOGIN_STATE:AWAIT_SMS]\n[LOGIN_REASON:等待验证]',
          latest_screenshot: transparentPngDataUrl,
        },
      },
      {
        event: 'state',
        data: { status: 'awaiting_sms', reason: '等待验证', latest_screenshot: transparentPngDataUrl },
      },
    ])

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-bind-dialog').click()
    await page.getByTestId('bind-phone-input').fill('13800000000')
    await startBind(page)

    const log = page.getByTestId('bind-progress-log')
    await expect(log).toContainText('正在登录平台')
    await expect(log).not.toContainText('[LOGIN_STATE:')
    await expect(log).not.toContainText('[LOGIN_REASON:')
    await expect(log).not.toContainText('![截图]')
  })
})
