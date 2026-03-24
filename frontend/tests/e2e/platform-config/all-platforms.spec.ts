/**
 * 全 6 平台账号新增测试。
 *
 * @platform-config
 */

import { test, expect } from '../fixtures/api'
import { selectRadixOption } from '../helpers/assertions'

const PLATFORMS = [
  { key: 'boss_zhipin', name: 'BOSS直聘', method: '手机' },
  { key: 'zhilian', name: '智联招聘', method: '手机' },
  { key: 'liepin', name: '猎聘', method: '扫码' },
  { key: '58', name: '58同城', method: '手机' },
  { key: '51job', name: '前程无忧', method: '密码' },
  { key: 'lagou', name: '拉勾招聘', method: '手机' },
]

test.describe('平台配置 - 全平台账号新增 @platform-config', () => {
  for (const { key, name, method } of PLATFORMS) {
    test(`新增 ${name} 账号成功并展示预览`, async ({ app, page }) => {
      app.setJobs([{ id: 'job-1', title: '前端工程师' }])

      await app.gotoRecruit('platform-config')
      await page.getByTestId('open-add-account-dialog').click()
      await expect(page.getByTestId('add-account-dialog')).toBeVisible()

      await selectRadixOption(page, 'add-account-platform-select', name)
      await expect(page.getByTestId('add-account-platform-preview')).toContainText(name)

      await page.getByTestId('add-account-name').fill(`${name}测试账号`)
      await page.getByTestId('add-account-submit').click()

      await expect(page.getByTestId('add-account-dialog')).toBeHidden()
      await expect(page.getByTestId('selected-account-panel')).toContainText(`${name}测试账号`)
    })
  }

  test('目录面板展示全部 6 个平台卡片', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts(
      PLATFORMS.map((p, i) => ({
        id: `account-${i}`,
        name: `${p.name}账号`,
        platform: p.key,
        status: 'needsLogin' as const,
        browser_session_key: `session-${i}`,
        latest_binding_session: null,
      })),
    )

    await app.gotoRecruit('platform-config')

    for (const { key } of PLATFORMS) {
      await expect(page.getByTestId(`platform-card-${key}`)).toBeVisible()
    }
  })

  test('同一平台可添加多个账号', async ({ app, page }) => {
    app.setJobs([{ id: 'job-1', title: '前端工程师' }])
    app.setPlatformAccounts([
      {
        id: 'account-1',
        name: '账号A',
        platform: 'boss_zhipin',
        status: 'needsLogin',
        browser_session_key: 'session-1',
        latest_binding_session: null,
      },
      {
        id: 'account-2',
        name: '账号B',
        platform: 'boss_zhipin',
        status: 'needsLogin',
        browser_session_key: 'session-2',
        latest_binding_session: null,
      },
    ])

    await app.gotoRecruit('platform-config')
    // 两个账号都应在列表中
    await expect(page.getByTestId('account-row-account-1')).toBeVisible()
    await expect(page.getByTestId('account-row-account-2')).toBeVisible()
  })
})
