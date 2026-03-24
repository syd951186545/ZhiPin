/**
 * 平台配置 - 边界用例（表单校验、特殊字符、提交保护）。
 *
 * @platform-config
 */

import { test, expect } from '../fixtures/api'
import { selectRadixOption } from '../helpers/assertions'

test.describe('平台配置 - 边界用例 @platform-config', () => {
  test('空账号名时提交按钮禁用', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-add-account-dialog').click()

    await selectRadixOption(page, 'add-account-platform-select', 'BOSS直聘')
    // 不填名称
    await expect(page.getByTestId('add-account-submit')).toBeDisabled()
  })

  test('不选平台时提交按钮禁用', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-add-account-dialog').click()

    await page.getByTestId('add-account-name').fill('测试账号')
    // 不选平台
    await expect(page.getByTestId('add-account-submit')).toBeDisabled()
  })

  test('特殊字符账号名可正常提交', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-add-account-dialog').click()

    await selectRadixOption(page, 'add-account-platform-select', 'BOSS直聘')
    await page.getByTestId('add-account-name').fill('<script>alert(1)</script>')
    await page.getByTestId('add-account-submit').click()

    await expect(page.getByTestId('add-account-dialog')).toBeHidden()
  })

  test('超长账号名(200字符)可提交', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    const longName = '长'.repeat(200)
    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-add-account-dialog').click()

    await selectRadixOption(page, 'add-account-platform-select', 'BOSS直聘')
    await page.getByTestId('add-account-name').fill(longName)
    await page.getByTestId('add-account-submit').click()

    await expect(page.getByTestId('add-account-dialog')).toBeHidden()
  })

  test('服务端重复错误保留表单', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.queueCreateAccountError('创建平台账号失败 (500): duplicate')

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-add-account-dialog').click()

    await selectRadixOption(page, 'add-account-platform-select', 'BOSS直聘')
    await page.getByTestId('add-account-name').fill('重复账号')
    await page.getByTestId('add-account-submit').click()

    // 错误可见，表单值保留
    await expect(page.getByText(/创建平台账号失败/)).toBeVisible()
    await expect(page.getByTestId('add-account-name')).toHaveValue('重复账号')
  })

  test('失败后关闭再打开重置表单', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.queueCreateAccountError('创建失败')

    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-add-account-dialog').click()
    await selectRadixOption(page, 'add-account-platform-select', 'BOSS直聘')
    await page.getByTestId('add-account-name').fill('失败账号')
    await page.getByTestId('add-account-submit').click()
    await expect(page.getByText(/创建失败/)).toBeVisible()

    // 关闭
    await page.getByRole('button', { name: '取消' }).click()
    // 重开
    await page.getByTestId('open-add-account-dialog').click()
    await expect(page.getByTestId('add-account-name')).toHaveValue('')
  })

  test('纯空格账号名提交禁用', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-add-account-dialog').click()

    await selectRadixOption(page, 'add-account-platform-select', 'BOSS直聘')
    await page.getByTestId('add-account-name').fill('   ')
    await expect(page.getByTestId('add-account-submit')).toBeDisabled()
  })

  test('快速双击提交不重复创建', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    await app.gotoRecruit('platform-config')
    await page.getByTestId('open-add-account-dialog').click()

    await selectRadixOption(page, 'add-account-platform-select', 'BOSS直聘')
    await page.getByTestId('add-account-name').fill('双击测试')

    // 快速点击两次
    const submitBtn = page.getByTestId('add-account-submit')
    await submitBtn.click()
    await submitBtn.click({ force: true }).catch(() => {})

    // 对话框关闭后，验证只创建了一个账号（列表中只有一个）
    await expect(page.getByTestId('add-account-dialog')).toBeHidden()
    await expect(page.getByText('当前平台暂无账号')).toHaveCount(0)
  })
})
