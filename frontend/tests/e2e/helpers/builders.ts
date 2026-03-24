/**
 * 共享测试数据构建器。
 *
 * 新测试文件使用这些构建器，现有 spec 文件保留各自的局部构建器不改动。
 */

import type { SseEvent } from './sse'

// ── 基础构建器 ──────────────────────────────────────────────

export function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'account-1',
    name: '华东招聘账号',
    platform: 'boss_zhipin',
    status: 'needsLogin',
    account_name: '13800000000',
    browser_session_key: 'session-1',
    latest_binding_session: null,
    ...overrides,
  }
}

export function buildBindingSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'binding-1',
    account_id: 'account-1',
    tenant_id: 'tenant-1',
    action: 'bind',
    status: 'running',
    step_key: 'INIT',
    latest_screenshot_url: null,
    qr_screenshot_url: null,
    error_message: null,
    ...overrides,
  }
}

export function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    title: '前端工程师',
    location: '上海',
    salary_min: 20,
    salary_max: 35,
    employment_type: 'full-time',
    department: '技术部',
    description: '负责前端业务开发',
    requirements: '3 年以上 React 经验',
    benefits: '六险一金',
    ...overrides,
  }
}

// ── 平台特定构建器 ──────────────────────────────────────────

export function buildBossAccount(overrides: Record<string, unknown> = {}) {
  return buildAccount({ platform: 'boss_zhipin', name: 'BOSS招聘账号', ...overrides })
}

export function buildZhilianAccount(overrides: Record<string, unknown> = {}) {
  return buildAccount({ platform: 'zhilian', name: '智联招聘账号', account_name: 'zl-user', ...overrides })
}

export function buildLiepinAccount(overrides: Record<string, unknown> = {}) {
  return buildAccount({ platform: 'liepin', name: '猎聘招聘账号', account_name: 'lp-user', ...overrides })
}

export function build58Account(overrides: Record<string, unknown> = {}) {
  return buildAccount({ platform: '58', name: '58同城账号', account_name: '58-user', ...overrides })
}

export function build51JobAccount(overrides: Record<string, unknown> = {}) {
  return buildAccount({ platform: '51job', name: '前程无忧账号', account_name: '51-user', ...overrides })
}

export function buildLagouAccount(overrides: Record<string, unknown> = {}) {
  return buildAccount({ platform: 'lagou', name: '拉勾招聘账号', account_name: 'lg-user', ...overrides })
}

// ── 工作流 SSE 事件构建器 ──────────────────────────────────

export function buildPublishJobMetaEvent(): SseEvent {
  return {
    event: 'workflow_meta',
    data: {
      workflow_id: 'publish_job',
      workflow_name: '发布招聘公告',
      steps: [
        { id: 'login_check', name_zh: '登录检查', requires_openclaw: true },
        { id: 'generate_announcement', name_zh: '生成招聘公告', requires_openclaw: true },
        { id: 'fill_and_publish', name_zh: '填写并发布', requires_openclaw: true },
        { id: 'verify_result', name_zh: '验证发布结果', requires_openclaw: true },
      ],
    },
  }
}

export function buildStepChangeEvent(
  stepId: string,
  status: 'running' | 'done' | 'failed',
  stepIndex: number,
  totalSteps: number,
  stepName?: string,
): SseEvent {
  return {
    event: 'step_change',
    data: {
      step_id: stepId,
      step_name: stepName || stepId,
      status,
      step_index: stepIndex,
      total_steps: totalSteps,
    },
  }
}

export function buildProgressEvent(stepId: string, text: string, delta?: string): SseEvent {
  return {
    event: 'progress',
    data: {
      step_id: stepId,
      delta: delta || text,
      accumulated_text: text,
    },
  }
}

export function buildScreenshotEvent(stepId: string, action: string): SseEvent {
  return {
    event: 'screenshot',
    data: {
      step_id: stepId,
      action,
      screenshot: `/api/openclaw/screenshot?ref=${stepId}&sig=ok`,
      timestamp: new Date().toISOString(),
    },
  }
}

export function buildCompleteEvent(data: Record<string, unknown> = {}): SseEvent {
  return {
    event: 'complete',
    data: {
      announcement: '测试公告',
      publish_result: { status: '成功', url: 'https://example.com/job/1' },
      screenshots: ['/api/openclaw/screenshot?ref=final&sig=ok'],
      ...data,
    },
  }
}

export function buildErrorEvent(stepId: string, message: string): SseEvent {
  return {
    event: 'error',
    data: { step_id: stepId, message },
  }
}

export function buildArtifactCreatedEvent(stepId: string, artifactId: string): SseEvent {
  return {
    event: 'artifact_created',
    data: {
      artifact_id: artifactId,
      run_id: 'exec-1',
      step_id: stepId,
      artifact_type: 'screenshot',
      source: 'openclaw_browser',
      capture_phase: 'after_action',
      mime_type: 'image/png',
      preview_url: `/api/openclaw/screenshot?ref=${artifactId}-preview&sig=ok`,
      live_url: `/api/openclaw/screenshot?ref=${artifactId}-preview&sig=ok`,
      captured_at: new Date().toISOString(),
      content_url: `/api/artifacts/${artifactId}/content`,
    },
  }
}

export function buildArtifactPersistedEvent(stepId: string, artifactId: string): SseEvent {
  return {
    event: 'artifact_persisted',
    data: {
      artifact_id: artifactId,
      run_id: 'exec-1',
      step_id: stepId,
      artifact_type: 'screenshot',
      source: 'openclaw_browser',
      capture_phase: 'after_action',
      mime_type: 'image/png',
      preview_url: `/api/openclaw/screenshot?ref=${artifactId}-preview&sig=ok`,
      live_url: `/api/openclaw/screenshot?ref=${artifactId}-preview&sig=ok`,
      signed_url: `/api/openclaw/screenshot?ref=${artifactId}-signed&sig=ok`,
      captured_at: new Date().toISOString(),
      content_url: `/api/artifacts/${artifactId}/content`,
    },
  }
}

// ── 完整场景流 ──────────────────────────────────────────────

export function buildPublishJobFullStream(): SseEvent[] {
  return [
    buildPublishJobMetaEvent(),
    buildStepChangeEvent('login_check', 'running', 0, 4, '登录检查'),
    buildProgressEvent('login_check', '检测登录中...'),
    buildScreenshotEvent('login_check', '登录检查'),
    buildStepChangeEvent('login_check', 'done', 0, 4, '登录检查'),
    buildStepChangeEvent('generate_announcement', 'running', 1, 4, '生成招聘公告'),
    buildProgressEvent('generate_announcement', '【AI公告内容】测试公告【/AI公告内容】'),
    buildStepChangeEvent('generate_announcement', 'done', 1, 4, '生成招聘公告'),
    buildStepChangeEvent('fill_and_publish', 'running', 2, 4, '填写并发布'),
    buildProgressEvent('fill_and_publish', '正在填写表单...'),
    buildScreenshotEvent('fill_and_publish', '填写并发布'),
    buildStepChangeEvent('fill_and_publish', 'done', 2, 4, '填写并发布'),
    buildStepChangeEvent('verify_result', 'running', 3, 4, '验证发布结果'),
    buildProgressEvent('verify_result', '正在验证发布结果...'),
    buildStepChangeEvent('verify_result', 'done', 3, 4, '验证发布结果'),
    buildCompleteEvent(),
  ]
}

export function buildPublishJobFailAtStep(failStep: string): SseEvent[] {
  const meta = buildPublishJobMetaEvent()
  const steps = ['login_check', 'generate_announcement', 'fill_and_publish', 'verify_result']
  const stepNames = ['登录检查', '生成招聘公告', '填写并发布', '验证发布结果']
  const events: SseEvent[] = [meta]

  for (let i = 0; i < steps.length; i++) {
    const stepId = steps[i]
    const stepName = stepNames[i]
    events.push(buildStepChangeEvent(stepId, 'running', i, 4, stepName))
    events.push(buildProgressEvent(stepId, `执行 ${stepName}...`))

    if (stepId === failStep) {
      events.push(buildStepChangeEvent(stepId, 'failed', i, 4, stepName))
      events.push(buildErrorEvent(stepId, `${stepName}执行失败`))
      break
    }

    events.push(buildStepChangeEvent(stepId, 'done', i, 4, stepName))
  }
  return events
}
