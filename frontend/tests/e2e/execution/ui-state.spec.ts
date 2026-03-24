/**
 * 招聘执行 - UI 状态一致性。
 *
 * @execution
 */

import { test, expect } from '../fixtures/api'
import {
  buildAccount,
  buildJob,
  buildPublishJobMetaEvent,
  buildStepChangeEvent,
  buildScreenshotEvent,
  buildCompleteEvent,
  buildArtifactCreatedEvent,
  buildArtifactPersistedEvent,
} from '../helpers/builders'

test.describe('招聘执行 - UI 状态一致性 @execution', () => {
  test('启动后监控面板可见', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-ui-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-ui-1', [buildPublishJobMetaEvent(), buildCompleteEvent()])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toBeVisible()
  })

  test('空 SSE 流不崩溃', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-ui-2', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-ui-2', []) // 空事件流

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    // 页面不崩溃，监控面板仍可见
    await expect(page.getByTestId('execution-monitor')).toBeVisible()
  })

  test('仅 workflow_meta 步骤全部 pending', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-ui-3', workflow_id: 'publish_job' })
    // 只发 meta 事件，不发任何 step_change
    app.setWorkflowStream('exec-ui-3', [buildPublishJobMetaEvent()])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    const monitor = page.getByTestId('execution-monitor')
    await expect(monitor).toBeVisible()
    // 步骤名应出现但全部为 pending/等待中状态
    await expect(monitor).toContainText('登录检查')
    await expect(monitor).toContainText('生成招聘公告')
  })

  test('截图去重', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-ui-4', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-ui-4', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      // 两个相同 URL 的截图事件
      buildScreenshotEvent('login_check', '登录检查'),
      buildScreenshotEvent('login_check', '登录检查'),
      buildStepChangeEvent('login_check', 'done', 0, 4, '登录检查'),
      buildCompleteEvent(),
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    // 相同 URL 的截图应去重，只展示 1 张
    await expect(page.getByTestId('execution-screenshots').getByRole('img')).toHaveCount(1)
  })

  test('artifact_persisted 显示"已落库"', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-ui-5', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-ui-5', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      buildArtifactCreatedEvent('login_check', 'artifact-1'),
      buildArtifactPersistedEvent('login_check', 'artifact-1'),
      buildStepChangeEvent('login_check', 'done', 0, 4, '登录检查'),
      buildCompleteEvent(),
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-screenshots')).toContainText('已落库')
  })

  test('执行中按钮文本变为停止', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-ui-6', workflow_id: 'publish_job' })
    // 不发 complete/error 事件，模拟执行中状态
    app.setWorkflowStream('exec-ui-6', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    // 执行中按钮应显示"停止"
    await expect(page.getByTestId('workflow-action-publish_job')).toContainText('停止')
  })
})
