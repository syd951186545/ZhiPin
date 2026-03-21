import {supabase} from '@/lib/supabase'
import type {
  PlatformBindingSession,
  PlatformCatalogItem,
  PlatformLoginMethod,
  PlatformProfile,
} from '@/types/openclaw'

async function getAuthToken(): Promise<string> {
  const {data} = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('当前登录已失效，请重新登录')
  return token
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken()
  return {
    Authorization: `Bearer ${token}`,
  }
}

export interface PlatformAccountApiRow extends PlatformProfile {
  platformUrl?: string
  loginMethod?: PlatformLoginMethod
  loginState?: string
  loginIdentifierMasked?: string
  lastError?: string
  browserSessionKey?: string
  latestBindingSession?: PlatformBindingSession | null
}

function mapAccount(row: Record<string, unknown>): PlatformAccountApiRow {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    platform: String(row.platform || '') as PlatformAccountApiRow['platform'],
    status: String(row.status || 'needsLogin') as PlatformAccountApiRow['status'],
    accountName: row.account_name ? String(row.account_name) : undefined,
    lastVerified: row.last_verified ? String(row.last_verified) : undefined,
    lastLogin: row.last_login ? String(row.last_login) : undefined,
    platformUrl: row.platform_url ? String(row.platform_url) : undefined,
    loginMethod: row.login_method ? String(row.login_method) as PlatformLoginMethod : undefined,
    loginState: row.login_state ? String(row.login_state) : undefined,
    loginIdentifierMasked: row.login_identifier_masked ? String(row.login_identifier_masked) : undefined,
    lastError: row.last_error ? String(row.last_error) : undefined,
    browserSessionKey: row.browser_session_key ? String(row.browser_session_key) : undefined,
    latestBindingSession: (row.latest_binding_session as PlatformBindingSession | null | undefined) || null,
  }
}

export async function fetchPlatformCatalog(): Promise<PlatformCatalogItem[]> {
  const resp = await fetch('/api/platforms/catalog')
  if (!resp.ok) throw new Error('加载平台目录失败')
  const data = await resp.json()
  return data.items || []
}

export async function fetchPlatformAccounts(): Promise<PlatformAccountApiRow[]> {
  const headers = await getAuthHeaders()
  const resp = await fetch('/api/platform-accounts', {headers})
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`加载平台账号失败 (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return ((data.items || []) as Array<Record<string, unknown>>).map(mapAccount)
}

export async function createPlatformAccount(payload: {
  platform: string
  name: string
  account_name?: string
  platform_url?: string
}): Promise<PlatformAccountApiRow> {
  const token = await getAuthToken()
  const resp = await fetch('/api/platform-accounts', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...payload, supabase_auth_token: token}),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`创建平台账号失败 (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return mapAccount(data.item || {})
}

export async function startPlatformBind(
  accountId: string,
  payload: {
    login_method: PlatformLoginMethod
    phone?: string
    login_name?: string
    password?: string
  },
): Promise<PlatformBindingSession> {
  const token = await getAuthToken()
  const resp = await fetch(`/api/platform-accounts/${accountId}/bind/start`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...payload, supabase_auth_token: token}),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`启动绑定失败 (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return data.item
}

export async function submitPlatformBind(
  sessionId: string,
  payload: {
    verification_code?: string
    secondary_code?: string
    password?: string
  },
): Promise<PlatformBindingSession> {
  const token = await getAuthToken()
  const resp = await fetch(`/api/platform-binding-sessions/${sessionId}/submit`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...payload, supabase_auth_token: token}),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`提交绑定信息失败 (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return data.item
}

export async function fetchBindingSession(sessionId: string): Promise<PlatformBindingSession> {
  const headers = await getAuthHeaders()
  const resp = await fetch(`/api/platform-binding-sessions/${sessionId}`, {headers})
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`加载绑定会话失败 (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return data.item
}

async function startSimpleAction(accountId: string, action: 'verify' | 'unbind'): Promise<PlatformBindingSession> {
  const token = await getAuthToken()
  const resp = await fetch(`/api/platform-accounts/${accountId}/${action}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({supabase_auth_token: token}),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`${action === 'verify' ? '验证' : '解绑'}失败 (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return data.item
}

export async function verifyPlatformAccount(accountId: string): Promise<PlatformBindingSession> {
  return startSimpleAction(accountId, 'verify')
}

export async function unbindPlatformAccount(accountId: string): Promise<PlatformBindingSession> {
  return startSimpleAction(accountId, 'unbind')
}

export interface PlatformBindingEventHandlers {
  onMeta?: (data: Record<string, unknown>) => void
  onProgress?: (data: Record<string, unknown>) => void
  onState?: (data: Record<string, unknown>) => void
  onComplete?: (data: Record<string, unknown>) => void
  onError?: (data: Record<string, unknown>) => void
}

export function subscribePlatformBindingSession(
  sessionId: string,
  handlers: PlatformBindingEventHandlers,
): () => void {
  const eventSource = new EventSource(`/api/platform-binding-sessions/${sessionId}/stream`)
  const eventMap: Record<string, keyof PlatformBindingEventHandlers> = {
    meta: 'onMeta',
    progress: 'onProgress',
    state: 'onState',
    complete: 'onComplete',
    error: 'onError',
  }

  for (const [eventName, handlerKey] of Object.entries(eventMap)) {
    eventSource.addEventListener(eventName, (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        const handler = handlers[handlerKey]
        if (handler) handler(data)
      } catch (error) {
        console.error(`[PlatformBinding] 解析 ${eventName} 事件失败`, error)
      }
    })
  }

  eventSource.onerror = () => {
    eventSource.close()
  }

  return () => eventSource.close()
}
