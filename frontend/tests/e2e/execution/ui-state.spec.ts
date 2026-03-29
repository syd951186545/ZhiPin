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

async function prepareExecutionGroup(page: import('@playwright/test').Page, platformName = 'BOSS直聘', accountName = '华东招聘账号', jobName = '前端工程师') {
  await page.getByTestId('execution-group-platform-0').click()
  await page.getByRole('option', { name: platformName }).click()
  await page.getByTestId('execution-group-account-0').click()
  await page.getByRole('option', { name: accountName }).click()
  await page.getByTestId('execution-group-job-0').click()
  await page.getByRole('option', { name: jobName }).click()
}

test.describe('招聘执行 - UI 状态一致性 @execution', () => {
  test('启动后监控面板可见', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-ui-1', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-ui-1', [buildPublishJobMetaEvent(), buildCompleteEvent()])

    await app.gotoRecruit('execute')
    await prepareExecutionGroup(page)
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-monitor')).toBeVisible()
  })

  test('空 SSE 流不崩溃', async ({ app, page }) => {
    app.setPlatformAccounts([buildAccount({ id: 'account-1', status: 'active' })])
    app.setJobs([buildJob({ id: 'job-1' })])
    app.queueWorkflowStartResponse({ execution_id: 'exec-ui-2', workflow_id: 'publish_job' })
    app.setWorkflowStream('exec-ui-2', []) // 空事件流

    await app.gotoRecruit('execute')
    await prepareExecutionGroup(page)
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
    await prepareExecutionGroup(page)
    await page.getByTestId('workflow-action-publish_job').click()

    const monitor = page.getByTestId('execution-monitor')
    await expect(monitor).toBeVisible()
    await page.getByRole('button', { name: '查看任务详情' }).click()
    await expect(page.getByTestId('execution-steps')).toContainText('登录检查')
    await expect(page.getByTestId('execution-steps')).toContainText('生成招聘公告')
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
      buildCompleteEvent({ screenshots: [] }),
    ])

    await app.gotoRecruit('execute')
    await prepareExecutionGroup(page)
    await page.getByTestId('workflow-action-publish_job').click()

    await page.getByRole('button', { name: '查看任务详情' }).click()
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
    await prepareExecutionGroup(page)
    await page.getByTestId('workflow-action-publish_job').click()

    await page.getByRole('button', { name: '查看任务详情' }).click()
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
    await prepareExecutionGroup(page)
    await page.getByTestId('workflow-action-publish_job').click()

    await expect(page.getByTestId('execution-running-queue').getByRole('button', { name: '停止', exact: true }).first()).toBeVisible()
  })

  test('任务预览明确显示同账号串行与不同账号并行', async ({ app, page }) => {
    app.setPlatformAccounts([
      buildAccount({ id: 'account-1', status: 'active', name: 'BOSS 主账号', platform: 'boss_zhipin' }),
      buildAccount({ id: 'account-2', status: 'active', name: '智联主账号', platform: 'zhilian', account_name: 'zl-admin' }),
    ])
    app.setJobs([buildJob({ id: 'job-1' })])

    app.setWorkflowRun('exec-ui-lane-1', {
      execution_id: 'exec-ui-lane-1',
      workflow_id: 'publish_job',
      workflow_name: '发布招聘公告',
      status: 'running',
      request: {
        account_id: 'account-1',
        platform_account_ids: { boss_zhipin: 'account-1' },
      },
      current_platform: {
        platform: 'boss_zhipin',
        platform_name: 'BOSS直聘',
        platform_index: 0,
        total_platforms: 1,
      },
      step_order: ['login_check', 'fill_and_publish'],
      steps: {
        login_check: { id: 'login_check', name_zh: '登录检查', status: 'done' },
        fill_and_publish: { id: 'fill_and_publish', name_zh: '填写并发布', status: 'running' },
      },
      accumulated_output: '正在填写表单...',
    })
    app.setWorkflowRun('exec-ui-lane-2', {
      execution_id: 'exec-ui-lane-2',
      workflow_id: 'publish_job',
      workflow_name: '发布招聘公告',
      status: 'queued',
      request: {
        account_id: 'account-1',
        platform_account_ids: { boss_zhipin: 'account-1' },
      },
      queue_position: 2,
      blocking_execution_count: 1,
      queue_message: '同账号串行等待中，前方还有 1 个任务。',
      step_order: ['login_check', 'fill_and_publish'],
      steps: {
        login_check: { id: 'login_check', name_zh: '登录检查', status: 'pending' },
        fill_and_publish: { id: 'fill_and_publish', name_zh: '填写并发布', status: 'pending' },
      },
      accumulated_output: '',
    })
    app.setWorkflowRun('exec-ui-lane-3', {
      execution_id: 'exec-ui-lane-3',
      workflow_id: 'talent_explore',
      workflow_name: '市场人才探索',
      status: 'running',
      request: {
        account_id: 'account-2',
        platform_account_ids: { zhilian: 'account-2' },
      },
      current_platform: {
        platform: 'zhilian',
        platform_name: '智联招聘',
        platform_index: 0,
        total_platforms: 1,
      },
      step_order: ['search_candidate'],
      steps: {
        search_candidate: { id: 'search_candidate', name_zh: '搜索候选人', status: 'running' },
      },
      accumulated_output: '正在检索候选人...',
    })

    await page.addInitScript(() => {
      window.localStorage.setItem('jiling-recruit:execution-ids', JSON.stringify(['exec-ui-lane-1', 'exec-ui-lane-2', 'exec-ui-lane-3']))
    })

    await app.gotoRecruit('execute')

    await expect(page.getByTestId('workflow-progress-overview')).toContainText('活跃任务')
    await expect(page.getByTestId('workflow-progress-overview')).toContainText('排队任务')
    await expect(page.getByTestId('workflow-progress-overview')).toContainText('参与账号')
    await expect(page.getByTestId('execution-running-queue')).toContainText('同账号串行')
    await expect(page.getByTestId('execution-running-queue')).toContainText('不同账号并行')
    await expect(page.getByTestId('execution-running-queue')).toContainText('BOSS 主账号')
    await expect(page.getByTestId('execution-running-queue')).toContainText('智联主账号')
    await expect(page.getByTestId('execution-running-queue')).toContainText('队列 #2')
  })
})
