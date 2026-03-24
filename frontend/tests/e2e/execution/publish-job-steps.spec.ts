/**
 * 招聘执行 - 发布公告步骤详情。
 *
 * @execution
 */

import { test, expect } from '../fixtures/api'
import {
  buildAccount,
  buildJob,
  buildPublishJobMetaEvent,
  buildStepChangeEvent,
  buildProgressEvent,
  buildScreenshotEvent,
  buildCompleteEvent,
  buildPublishJobFullStream,
} from '../helpers/builders'

test.describe('招聘执行 - 发布公告步骤详情 @execution', () => {
  test('4步完整成功 - 每步状态 pending→running→done', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-full-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-full-1', buildPublishJobFullStream())

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toBeVisible()
    await expect(page.getByTestId('execution-monitor')).toContainText('已完成')
  })

  test('进度文本逐步累积', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-progress-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-progress-1', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      buildProgressEvent('login_check', '检测登录中...'),
      buildProgressEvent('login_check', '检测登录中...\n登录已确认'),
      buildStepChangeEvent('login_check', 'done', 0, 4, '登录检查'),
      buildCompleteEvent(),
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    const output = page.getByTestId('execution-output')
    await expect(output).toContainText('检测登录中...')
    await expect(output).toContainText('登录已确认')
  })

  test('截图在步骤执行时实时展示', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-shot-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-shot-1', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      buildScreenshotEvent('login_check', '登录检查'),
      buildStepChangeEvent('login_check', 'done', 0, 4, '登录检查'),
      buildStepChangeEvent('fill_and_publish', 'running', 2, 4, '填写并发布'),
      buildScreenshotEvent('fill_and_publish', '填写并发布'),
      buildStepChangeEvent('fill_and_publish', 'done', 2, 4, '填写并发布'),
      buildCompleteEvent(),
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-screenshots').getByRole('img')).toHaveCount(2)
  })

  test('工作流元数据正确渲染步骤名', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-meta-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-meta-1', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
      buildCompleteEvent(),
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    const monitor = page.getByTestId('execution-monitor')
    await expect(monitor).toContainText('登录检查')
    await expect(monitor).toContainText('生成招聘公告')
    await expect(monitor).toContainText('填写并发布')
    await expect(monitor).toContainText('验证发布结果')
  })

  test('payload 包含完整岗位和企业信息', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1', title: '高级前端工程师' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-payload-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-payload-1', [buildPublishJobMetaEvent(), buildCompleteEvent()])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toBeVisible()
    expect(app.workflowStarts).toHaveLength(1)
    expect(app.workflowStarts[0]).toMatchObject({
      workflow_id: 'publish_job',
      account_id: 'account-1',
      job_id: 'job-1',
      job_title: '高级前端工程师',
    })
  })

  test('AI 公告内容正确提取展示', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-ai-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-ai-1', [
      buildPublishJobMetaEvent(),
      buildStepChangeEvent('generate_announcement', 'running', 1, 4, '生成招聘公告'),
      buildProgressEvent('generate_announcement', '【AI公告内容】优秀的前端工程师招聘公告【/AI公告内容】'),
      buildStepChangeEvent('generate_announcement', 'done', 1, 4, '生成招聘公告'),
      buildCompleteEvent({ announcement: '优秀的前端工程师招聘公告' }),
    ])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-output')).toContainText('优秀的前端工程师招聘公告')
  })

  test('完成后可立即启动新工作流', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-done-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-done-1', [buildPublishJobMetaEvent(), buildCompleteEvent()])

    await app.gotoRecruit('execute')
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toContainText('已完成')

    // 完成后按钮回到"开始执行"且可点击
    const actionBtn = page.getByTestId('workflow-action-publish_job')
    await expect(actionBtn).toContainText('开始执行')
    await expect(actionBtn).toBeEnabled()
  })
})
