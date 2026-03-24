import { test as base, expect, type Page, type Route } from '@playwright/test'

import { defaultMockUser, installAuthenticatedSession, type MockUser } from './auth'
import { toEventStream, transparentPngDataUrl, type SseEvent } from '../helpers/sse'

interface PlatformCatalogItem {
  key: string
  name: string
  enterprise_url: string
  recommended_login_method: string
  supported_login_methods: string[]
}

interface BindingSession {
  id: string
  account_id: string
  tenant_id: string
  action: 'bind' | 'verify' | 'unbind'
  status: string
  step_key?: string | null
  latest_screenshot_url?: string | null
  qr_screenshot_url?: string | null
  error_message?: string | null
  expires_at?: string | null
}

interface PlatformAccount {
  id: string
  name: string
  platform: string
  status: string
  account_name?: string
  browser_session_key?: string
  last_error?: string | null
  latest_binding_session?: BindingSession | null
}

interface JobRow {
  id: string
  title: string
  location?: string
  salary_min?: number
  salary_max?: number
  employment_type?: string
  department?: string
  description?: string
  requirements?: string
  benefits?: string
}

interface WorkflowStartPayload {
  [key: string]: unknown
}

interface WorkflowTemplateItem {
  id: string
  title: string
  description: string
  multi_platform: boolean
  execution_mode: string
  screenshot_mode: string
  handoff_triggers: string[]
  required_fields: Array<Record<string, unknown>>
  steps: Array<Record<string, unknown>>
}

interface MockApp {
  user: MockUser
  setHealth(ok: boolean): void
  setPlatformCatalog(items: PlatformCatalogItem[]): void
  setPlatformAccounts(items: PlatformAccount[]): void
  setJobs(items: JobRow[]): void
  setTenantSettings(patch: Record<string, unknown>): void
  setAutomationTasks(items: Record<string, unknown>[]): void
  queueCreateAccountError(detail: string, status?: number): void
  queueDeleteAccountError(detail: string, status?: number): void
  queueBindStartResponse(session: BindingSession): void
  queueBindSubmitResponse(session: BindingSession): void
  queueVerifyResponse(session: BindingSession): void
  queueUnbindResponse(session: BindingSession): void
  setBindingSession(session: BindingSession): void
  setBindingStream(sessionId: string, events: SseEvent[]): void
  setRefreshQrResponse(sessionId: string, qrScreenshotUrl: string | null): void
  queueWorkflowStartResponse(response: { execution_id: string; workflow_id: string; message?: string }): void
  setWorkflowStream(executionId: string, events: SseEvent[]): void
  setWorkflowRun(executionId: string, payload: Record<string, unknown>): void
  queueJobDetailError(detail: string, status?: number): void
  queueBindStartError(detail: string, status?: number): void
  queueWorkflowStartError(detail: string, status?: number): void
  gotoRecruit(tab?: 'execute' | 'platform-config'): Promise<void>
  workflowStarts: WorkflowStartPayload[]
  bindStarts: Record<string, unknown>[]
  bindSubmits: Record<string, unknown>[]
  cancelRequests: string[]
}

const defaultCatalog: PlatformCatalogItem[] = [
  {
    key: 'boss_zhipin',
    name: 'BOSS直聘',
    enterprise_url: 'https://www.zhipin.com/web/geek/job',
    recommended_login_method: 'phone',
    supported_login_methods: ['phone', 'qr'],
  },
  {
    key: 'zhilian',
    name: '智联招聘',
    enterprise_url: 'https://i.zhaopin.com/',
    recommended_login_method: 'phone',
    supported_login_methods: ['phone', 'password'],
  },
  {
    key: 'liepin',
    name: '猎聘',
    enterprise_url: 'https://vip.liepin.com/',
    recommended_login_method: 'qr',
    supported_login_methods: ['phone', 'qr', 'password'],
  },
  {
    key: '58',
    name: '58同城',
    enterprise_url: 'https://passport.58.com/login/?path=http%3A%2F%2Fvip.58.com',
    recommended_login_method: 'phone',
    supported_login_methods: ['phone', 'qr', 'password'],
  },
  {
    key: '51job',
    name: '前程无忧 / 51job',
    enterprise_url: 'https://ehire.51job.com/',
    recommended_login_method: 'password',
    supported_login_methods: ['phone', 'qr', 'password'],
  },
  {
    key: 'lagou',
    name: '拉勾招聘',
    enterprise_url: 'https://easy.lagou.com/',
    recommended_login_method: 'phone',
    supported_login_methods: ['phone', 'qr', 'password'],
  },
]

const defaultTenantSettings = {
  id: 'tenant-setting-1',
  tenant_id: defaultMockUser.tenantId,
  company_name: '测试科技有限公司',
  company_address: '上海市浦东新区',
  company_size: '100-499人',
  company_overview: '一家专注招聘自动化的平台公司',
  ai_model: 'gpt-5.4',
  ai_api_key: null,
  ai_validation_status: 'success',
  ai_validation_message: null,
  ai_validated_at: null,
  notification_wecom_url: null,
  notification_email: null,
  audit_logging: true,
  data_retention_days: 90,
}

const defaultWorkflowTemplates: WorkflowTemplateItem[] = [
  {
    id: 'publish_job',
    title: '发布招聘公告',
    description: '复用已绑定账号，自动填写岗位信息并发布到招聘平台。',
    multi_platform: false,
    execution_mode: 'auto_submit',
    screenshot_mode: 'direct_url',
    handoff_triggers: ['captcha', 'anti_bot', 'auth_required', 'verifier_failed'],
    required_fields: [],
    steps: [],
  },
  {
    id: 'talent_explore',
    title: '市场人才探索',
    description: '进入人才库主动搜索、筛选并沟通匹配候选人。',
    multi_platform: false,
    execution_mode: 'auto_submit',
    screenshot_mode: 'direct_url',
    handoff_triggers: ['captcha', 'anti_bot', 'auth_required'],
    required_fields: [],
    steps: [],
  },
  {
    id: 'resume_screen',
    title: '简历筛选及AI沟通',
    description: '多平台依次复用默认账号，AI 自动筛选简历并沟通。',
    multi_platform: true,
    execution_mode: 'auto_submit',
    screenshot_mode: 'direct_url',
    handoff_triggers: ['captcha', 'anti_bot', 'auth_required'],
    required_fields: [],
    steps: [],
  },
]

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function jsonHeaders(extra?: Record<string, string>) {
  return {
    'content-type': 'application/json',
    ...extra,
  }
}

async function parseJson(route: Route) {
  const body = route.request().postData()
  return body ? JSON.parse(body) : {}
}

function createMockApp(page: Page): MockApp {
  let healthOk = true
  let platformCatalog = deepClone(defaultCatalog)
  let platformAccounts: PlatformAccount[] = []
  let jobs: JobRow[] = []
  let tenantSettings = { ...defaultTenantSettings }
  let automationTasks: Record<string, unknown>[] = []
  let workflowTemplates = deepClone(defaultWorkflowTemplates)
  let nextCreateAccountError: { detail: string; status: number } | null = null
  let nextDeleteAccountError: { detail: string; status: number } | null = null
  let nextJobDetailError: { detail: string; status: number } | null = null
  let nextBindStartError: { detail: string; status: number } | null = null
  let nextWorkflowStartError: { detail: string; status: number } | null = null
  const nextBindStartResponses: BindingSession[] = []
  const nextBindSubmitResponses: BindingSession[] = []
  const nextVerifyResponses: BindingSession[] = []
  const nextUnbindResponses: BindingSession[] = []
  const bindingSessions = new Map<string, BindingSession>()
  const bindingStreams = new Map<string, SseEvent[]>()
  const refreshQrResponses = new Map<string, string | null>()
  const nextWorkflowStartResponses: Array<{ execution_id: string; workflow_id: string; message?: string }> = []
  const workflowStreams = new Map<string, SseEvent[]>()
  const workflowRuns = new Map<string, Record<string, unknown>>()

  const workflowStarts: WorkflowStartPayload[] = []
  const bindStarts: Record<string, unknown>[] = []
  const bindSubmits: Record<string, unknown>[] = []
  const cancelRequests: string[] = []

  const upsertAccountFromSession = (session: BindingSession) => {
    platformAccounts = platformAccounts.map((account) =>
      account.id === session.account_id
        ? {
            ...account,
            status:
              session.status === 'completed'
                ? session.action === 'unbind'
                  ? 'needsLogin'
                  : 'active'
                : session.status === 'failed'
                  ? session.action === 'verify'
                    ? 'expired'
                    : 'needsLogin'
                  : 'verifying',
            latest_binding_session: session,
          }
        : account,
    )
  }

  const fulfillJson = async (route: Route, payload: unknown, status = 200) =>
    route.fulfill({ status, headers: jsonHeaders(), body: JSON.stringify(payload) })

  const fulfillPostgrest = async (route: Route, payload: unknown, status = 200) =>
    route.fulfill({
      status,
      headers: jsonHeaders({
        'content-range': Array.isArray(payload) ? `0-${Math.max(payload.length - 1, 0)}/${payload.length}` : '0-0/1',
      }),
      body: JSON.stringify(payload),
    })

  page.route('**/api/health', async (route) => {
    if (healthOk) {
      await fulfillJson(route, { status: 'ok' })
      return
    }
    await fulfillJson(route, { detail: '后端服务不可用' }, 503)
  })

  page.route('**/api/platforms/catalog', async (route) => {
    await fulfillJson(route, { items: platformCatalog })
  })

  page.route('**/api/platform-accounts', async (route) => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, { items: platformAccounts })
      return
    }

    if (nextCreateAccountError) {
      const error = nextCreateAccountError
      nextCreateAccountError = null
      await fulfillJson(route, { detail: error.detail }, error.status)
      return
    }

    const payload = await parseJson(route)
    const created: PlatformAccount = {
      id: `account-${platformAccounts.length + 1}`,
      name: String(payload.name || '未命名账号'),
      platform: String(payload.platform || ''),
      status: 'needsLogin',
      account_name: payload.account_name ? String(payload.account_name) : '',
      browser_session_key: `session-${platformAccounts.length + 1}`,
      latest_binding_session: null,
    }
    platformAccounts = [...platformAccounts, created]
    await fulfillJson(route, { item: created }, 200)
  })

  page.route(/.*\/api\/platform-accounts\/[^/]+\/bind\/start$/, async (route) => {
    const payload = await parseJson(route)
    bindStarts.push(payload)
    if (nextBindStartError) {
      const error = nextBindStartError
      nextBindStartError = null
      await fulfillJson(route, { detail: error.detail }, error.status)
      return
    }
    const accountId = route.request().url().split('/').slice(-3)[0]
    const session =
      nextBindStartResponses.shift() || {
        id: `binding-${Date.now()}`,
        account_id: accountId,
        tenant_id: defaultMockUser.tenantId,
        action: 'bind',
        status: 'running',
        step_key: 'INIT',
        latest_screenshot_url: null,
        qr_screenshot_url: null,
        error_message: null,
      }
    bindingSessions.set(session.id, session)
    upsertAccountFromSession(session)
    await fulfillJson(route, { item: session })
  })

  page.route(/.*\/api\/platform-binding-sessions\/[^/]+\/submit$/, async (route) => {
    const payload = await parseJson(route)
    bindSubmits.push(payload)
    const sessionId = route.request().url().split('/').slice(-2)[0]
    const session =
      nextBindSubmitResponses.shift() || {
        ...(bindingSessions.get(sessionId) || {
          id: sessionId,
          account_id: platformAccounts[0]?.id || 'account-1',
          tenant_id: defaultMockUser.tenantId,
          action: 'bind',
        }),
        status: 'running',
        step_key: 'SUBMIT',
        latest_screenshot_url: null,
        qr_screenshot_url: null,
        error_message: null,
      }
    bindingSessions.set(session.id, session)
    upsertAccountFromSession(session)
    await fulfillJson(route, { item: session })
  })

  page.route(/.*\/api\/platform-binding-sessions\/[^/]+$/, async (route) => {
    const sessionId = route.request().url().split('/').pop() || ''
    const session = bindingSessions.get(sessionId)
    if (!session) {
      await fulfillJson(route, { detail: '绑定会话不存在' }, 404)
      return
    }
    await fulfillJson(route, { item: session })
  })

  page.route(/.*\/api\/platform-binding-sessions\/[^/]+\/refresh-qr$/, async (route) => {
    const sessionId = route.request().url().split('/').slice(-2)[0]
    await fulfillJson(route, { qr_screenshot_url: refreshQrResponses.get(sessionId) ?? transparentPngDataUrl })
  })

  page.route(/.*\/api\/platform-binding-sessions\/[^/]+\/stream(?:\?.*)?$/, async (route) => {
    const match = route.request().url().match(/platform-binding-sessions\/([^/]+)\/stream/)
    const sessionId = match?.[1] || ''
    const events = bindingStreams.get(sessionId) || []
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: toEventStream(events),
    })
  })

  page.route(/.*\/api\/platform-accounts\/[^/]+\/verify$/, async (route) => {
    const accountId = route.request().url().split('/').slice(-2)[0]
    const session =
      nextVerifyResponses.shift() || {
        id: `verify-${Date.now()}`,
        account_id: accountId,
        tenant_id: defaultMockUser.tenantId,
        action: 'verify',
        status: 'running',
        step_key: 'VERIFY',
        latest_screenshot_url: null,
        qr_screenshot_url: null,
        error_message: null,
      }
    bindingSessions.set(session.id, session)
    upsertAccountFromSession(session)
    await fulfillJson(route, { item: session })
  })

  page.route(/.*\/api\/platform-accounts\/[^/]+\/unbind$/, async (route) => {
    const accountId = route.request().url().split('/').slice(-2)[0]
    const session =
      nextUnbindResponses.shift() || {
        id: `unbind-${Date.now()}`,
        account_id: accountId,
        tenant_id: defaultMockUser.tenantId,
        action: 'unbind',
        status: 'running',
        step_key: 'UNBIND',
        latest_screenshot_url: null,
        qr_screenshot_url: null,
        error_message: null,
      }
    bindingSessions.set(session.id, session)
    upsertAccountFromSession(session)
    await fulfillJson(route, { item: session })
  })

  page.route(/.*\/api\/platform-accounts\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback()
      return
    }
    if (nextDeleteAccountError) {
      const error = nextDeleteAccountError
      nextDeleteAccountError = null
      await fulfillJson(route, { detail: error.detail }, error.status)
      return
    }
    const accountId = route.request().url().split('/').pop() || ''
    platformAccounts = platformAccounts.filter((item) => item.id !== accountId)
    await fulfillJson(route, { success: true })
  })

  page.route(/.*\/api\/workflow\/start$/, async (route) => {
    const payload = await parseJson(route)
    workflowStarts.push(payload)
    if (nextWorkflowStartError) {
      const error = nextWorkflowStartError
      nextWorkflowStartError = null
      await fulfillJson(route, { detail: error.detail }, error.status)
      return
    }
    const response =
      nextWorkflowStartResponses.shift() || {
        execution_id: 'exec-default',
        workflow_id: String(payload.workflow_id || 'publish_job'),
        message: '工作流已启动',
      }
    await fulfillJson(route, response)
  })

  page.route(/.*\/api\/workflow\/cancel\/.+$/, async (route) => {
    const executionId = route.request().url().split('/').pop() || ''
    cancelRequests.push(executionId)
    await fulfillJson(route, { message: '已发送取消请求' })
  })

  page.route(/.*\/api\/workflow\/stream\/.+$/, async (route) => {
    const executionId = route.request().url().split('/').pop() || ''
    const events = workflowStreams.get(executionId) || []
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: toEventStream(events),
    })
  })

  page.route('**/api/workflow-templates/validate', async (route) => {
    const payload = await parseJson(route)
    const workflowId = String(payload.workflow_id || '')
    const template = workflowTemplates.find((item) => item.id === workflowId) || null
    await fulfillJson(route, {
      valid: true,
      errors: [],
      normalized: payload.payload || {},
      template,
    })
  })

  page.route('**/api/workflow-templates', async (route) => {
    await fulfillJson(route, {items: workflowTemplates})
  })

  page.route(/.*\/api\/workflow-runs\/[^/]+$/, async (route) => {
    const executionId = route.request().url().split('/').pop() || ''
    const payload = workflowRuns.get(executionId)
    if (!payload) {
      await fulfillJson(route, { detail: '工作流运行不存在' }, 404)
      return
    }
    await fulfillJson(route, payload)
  })

  page.route(/.*\/rest\/v1\/profiles.*/, async (route) => {
    await fulfillPostgrest(route, {
      full_name: defaultMockUser.name,
      tenant_id: defaultMockUser.tenantId,
      role: defaultMockUser.role,
    })
  })

  page.route(/.*\/rest\/v1\/tenant_settings.*/, async (route) => {
    await fulfillPostgrest(route, tenantSettings)
  })

  page.route(/.*\/rest\/v1\/jobs.*/, async (route) => {
    if (nextJobDetailError && route.request().url().includes('id=eq.')) {
      const error = nextJobDetailError
      nextJobDetailError = null
      await fulfillJson(route, { message: error.detail }, error.status)
      return
    }
    const url = new URL(route.request().url())
    const jobId = url.searchParams.get('id')
    if (jobId?.startsWith('eq.')) {
      const item = jobs.find((job) => job.id === jobId.replace('eq.', ''))
      await fulfillPostgrest(route, item || {})
      return
    }
    await fulfillPostgrest(route, jobs.map(({ id, title }) => ({ id, title })))
  })

  page.route(/.*\/rest\/v1\/automation_tasks.*/, async (route) => {
    if (route.request().method() === 'GET') {
      await fulfillPostgrest(route, automationTasks)
      return
    }
    await fulfillPostgrest(route, {})
  })

  page.route(/.*\/rest\/v1\/task_logs.*/, async (route) => {
    await fulfillPostgrest(route, [])
  })

  page.route('**/api/openclaw/screenshot**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(transparentPngDataUrl.split(',')[1], 'base64'),
    })
  })

  const app: MockApp = {
    user: defaultMockUser,
    setHealth(ok) {
      healthOk = ok
    },
    setPlatformCatalog(items) {
      platformCatalog = deepClone(items)
    },
    setPlatformAccounts(items) {
      platformAccounts = deepClone(items)
      for (const account of items) {
        if (account.latest_binding_session) {
          bindingSessions.set(account.latest_binding_session.id, account.latest_binding_session)
        }
      }
    },
    setJobs(items) {
      jobs = deepClone(items)
    },
    setTenantSettings(patch) {
      tenantSettings = { ...tenantSettings, ...patch }
    },
    setAutomationTasks(items) {
      automationTasks = deepClone(items)
    },
    queueCreateAccountError(detail, status = 500) {
      nextCreateAccountError = { detail, status }
    },
    queueDeleteAccountError(detail, status = 500) {
      nextDeleteAccountError = { detail, status }
    },
    queueBindStartResponse(session) {
      nextBindStartResponses.push(deepClone(session))
    },
    queueBindSubmitResponse(session) {
      nextBindSubmitResponses.push(deepClone(session))
    },
    queueVerifyResponse(session) {
      nextVerifyResponses.push(deepClone(session))
    },
    queueUnbindResponse(session) {
      nextUnbindResponses.push(deepClone(session))
    },
    setBindingSession(session) {
      bindingSessions.set(session.id, deepClone(session))
    },
    setBindingStream(sessionId, events) {
      bindingStreams.set(sessionId, deepClone(events))
    },
    setRefreshQrResponse(sessionId, qrScreenshotUrl) {
      refreshQrResponses.set(sessionId, qrScreenshotUrl)
    },
    queueWorkflowStartResponse(response) {
      nextWorkflowStartResponses.push(deepClone(response))
    },
    setWorkflowStream(executionId, events) {
      workflowStreams.set(executionId, deepClone(events))
    },
    setWorkflowRun(executionId, payload) {
      workflowRuns.set(executionId, deepClone(payload))
    },
    queueJobDetailError(detail, status = 500) {
      nextJobDetailError = { detail, status }
    },
    queueBindStartError(detail, status = 500) {
      nextBindStartError = { detail, status }
    },
    queueWorkflowStartError(detail, status = 500) {
      nextWorkflowStartError = { detail, status }
    },
    async gotoRecruit(tab = 'execute') {
      await page.goto('/jiling-recruit')
      if (tab === 'platform-config') {
        await page.getByTestId('tab-platform-config').click()
      } else {
        await page.getByTestId('tab-execute').click()
      }
    },
    workflowStarts,
    bindStarts,
    bindSubmits,
    cancelRequests,
  }

  return app
}

export const test = base.extend<{ app: MockApp }>({
  app: async ({ page }, use) => {
    await installAuthenticatedSession(page, defaultMockUser)
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.innerHTML = `
          *,
          *::before,
          *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            scroll-behavior: auto !important;
          }
        `
        document.head.appendChild(style)
      })
    })

    const app = createMockApp(page)
    await use(app)
  },
})

export { expect }
