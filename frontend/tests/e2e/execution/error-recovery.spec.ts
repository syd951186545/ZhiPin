/**
 * 招聘执行 - 失败恢复与部分数据保留。
 *
 * @execution
 */

import { test, expect } from '../fixtures/api'
import {
  buildAccount,
  buildJob,
  buildPublishJobFailAtStep,
  buildPublishJobMetaEvent,
  buildStepChangeEvent,
  buildProgressEvent,
  buildScreenshotEvent,
  buildErrorEvent,
} from '../helpers/builders'

test.describe('招聘执行 - 错误恢复 @execution', () => {
  test('步骤失败显示错误消息', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-err-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-err-1', buildPublishJobFailAtStep('login_check'))

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toContainText('登录检查执行失败')
  })

  test('生成公告失败保留登录检查已完成', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-err-2', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-err-2', buildPublishJobFailAtStep('generate_announcement'))

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    const monitor = page.getByTestId('execution-monitor')
    await expect(monitor).toContainText('生成招聘公告执行失败')
    // 登录检查应已完成
    await expect(page.getByTestId('execution-output')).toContainText('执行 登录检查')
  })

  test('填写发布失败保留前序步骤', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-err-3', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-err-3', buildPublishJobFailAtStep('fill_and_publish'))

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toContainText('填写并发布执行失败')
  })

  test('验证结果失败', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-err-4', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-err-4', buildPublishJobFailAtStep('verify_result'))

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toContainText('验证发布结果执行失败')
  })

  test('失败后截图保留', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-err-5', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-err-5', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      buildScreenshotEvent('login_check', '登录检查'),
      buildStepChangeEvent('login_check', 'done', 0, 4, '登录检查'),
      buildStepChangeEvent('generate_announcement', 'running', 1, 4, '生成招聘公告'),
      buildScreenshotEvent('generate_announcement', '生成招聘公告'),
      buildStepChangeEvent('generate_announcement', 'failed', 1, 4, '生成招聘公告'),
      buildErrorEvent('generate_announcement', '生成公告时出错'),
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    // 截图应保留（失败前的 2 张截图仍然展示）
    await expect(page.getByTestId('execution-screenshots').getByRole('img')).toHaveCount(2)
    await expect(page.getByTestId('execution-monitor')).toContainText('生成公告时出错')
  })

  test('失败后按钮回到可启动状态', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-err-6', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-err-6', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      buildStepChangeEvent('login_check', 'failed', 0, 4, '登录检查'),
      buildErrorEvent('login_check', '登录失败'),
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toContainText('登录失败')

    // 失败后按钮文本回到"开始执行"
    const actionBtn = page.getByTestId('workflow-action-publish_job')
    await expect(actionBtn).toContainText('开始执行')
    await expect(actionBtn).toBeEnabled()
  })
})
