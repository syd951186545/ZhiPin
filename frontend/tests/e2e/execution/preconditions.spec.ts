/**
 * 招聘执行 - 前置条件校验。
 *
 * @execution
 */

import { test, expect } from '../fixtures/api'
import { buildAccount, buildJob } from '../helpers/builders'
import { selectPlatformValue } from '../helpers/assertions'

test.describe('招聘执行 - 前置条件校验 @execution', () => {
  test('后端断开禁用全部执行按钮', async ({ app, page }) => {
    app.setHealth(false)
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])

    await app.gotoRecruit('execute')

    await expect(page.getByTestId('workflow-action-publish_job')).toBeDisabled()
    await page.getByTestId('workflow-card-talent_explore').first().click()
    await expect(page.getByTestId('workflow-action-talent_explore')).toBeDisabled()
    await page.getByTestId('workflow-card-resume_screen').first().click()
    await expect(page.getByTestId('workflow-action-resume_screen')).toBeDisabled()
  })

  test('无岗位时启动失败或按钮禁用', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([]) // 无岗位

    await app.gotoRecruit('execute')

    // 没有岗位可选时应禁用启动或显示提示
    const publishBtn = page.getByTestId('workflow-action-publish_job')
    const isDisabled = await publishBtn.isDisabled()
    if (!isDisabled) {
      await publishBtn.click()
      await expect(page.getByText(/岗位|job/i)).toBeVisible()
    }
    expect(app.workflowStarts).toHaveLength(0)
  })

  test('岗位详情加载失败阻止启动', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueJobDetailError('加载岗位详情失败', 500)

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByText(/加载岗位详情失败/)).toBeVisible()
    expect(app.workflowStarts).toHaveLength(0)
  })

  test('待绑定账号启动给出警告', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'needsLogin' })])
    app.setJobs([buildJob({ id: 'job-1' })])

    await app.gotoRecruit('execute')

    // needsLogin 账号应显示警告或禁用启动
    const publishBtn = page.getByTestId('workflow-action-publish_job')
    const warning = page.getByText(/绑定|登录|需要/i)
    const isDisabled = await publishBtn.isDisabled()

    if (!isDisabled) {
      await publishBtn.click()
      // 启动后应有警告或错误提示
      await expect(page.getByText(/绑定|登录|需要|未激活|inactive/i)).toBeVisible()
    } else {
      // 按钮被禁用本身就是正确行为
      expect(isDisabled).toBe(true)
    }
  })

  test('过期账号启动给出警告', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'expired' })])
    app.setJobs([buildJob({ id: 'job-1' })])

    await app.gotoRecruit('execute')

    const publishBtn = page.getByTestId('workflow-action-publish_job')
    const isDisabled = await publishBtn.isDisabled()

    if (!isDisabled) {
      await publishBtn.click()
      await expect(page.getByText(/过期|expired|绑定|登录/i)).toBeVisible()
    } else {
      expect(isDisabled).toBe(true)
    }
  })
})
