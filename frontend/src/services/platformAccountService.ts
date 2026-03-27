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

async function readErrorDetail(resp: Response): Promise<string> {
  try {
    const data = await resp.json()
    if (typeof data?.detail === 'string' && data.detail.trim()) {
      return data.detail
    }
    return JSON.stringify(data)
  } catch {
    return await resp.text().catch(() => '')
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

// ── Live Login (noVNC) ────────────────────────────────────────

export interface LiveLoginSession {
  session_id: string
  ws_port: number
  vnc_token: string
  ws_url: string
  login_url: string
  timeout_seconds: number
}

export interface LiveLoginStatus {
  session_id: string
  active: boolean
  time_remaining: number | null
}

export interface ConfirmLiveLoginResult {
  is_logged_in: boolean
  message: string
  workspace_saved?: boolean
  db_saved?: boolean
  persistence_detail?: string
}

export async function startLiveLogin(
  accountId: string,
  platform: string,
): Promise<LiveLoginSession> {
  const authHeaders = await getAuthHeaders()
  const resp = await fetch('/api/live-login/start', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...authHeaders},
    body: JSON.stringify({account_id: accountId, platform}),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`启动远程登录失败 (${resp.status}): ${text}`)
  }
  return resp.json()
}

export async function confirmLiveLogin(sessionId: string): Promise<ConfirmLiveLoginResult> {
  const authHeaders = await getAuthHeaders()
  const resp = await fetch(`/api/live-login/${sessionId}/confirm`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...authHeaders},
    body: JSON.stringify({}),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`确认登录失败 (${resp.status}): ${text}`)
  }
  return resp.json()
}

export async function stopLiveLogin(sessionId: string): Promise<void> {
  const authHeaders = await getAuthHeaders()
  const resp = await fetch(`/api/live-login/${sessionId}/stop`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...authHeaders},
    body: JSON.stringify({}),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`停止登录会话失败 (${resp.status}): ${text}`)
  }
}

export async function getLiveLoginStatus(sessionId: string): Promise<LiveLoginStatus> {
  const headers = await getAuthHeaders()
  const resp = await fetch(`/api/live-login/${sessionId}/status`, {headers})
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`获取登录状态失败 (${resp.status}): ${text}`)
  }
  return resp.json()
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
    const text = await readErrorDetail(resp)
    throw new Error(`${action === 'verify' ? '验证' : '解绑'}失败 (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return data.item
}

export async function refreshQrCode(sessionId: string): Promise<string | null> {
  const token = await getAuthToken()
  const resp = await fetch(`/api/platform-binding-sessions/${sessionId}/refresh-qr`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({supabase_auth_token: token}),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`刷新二维码失败 (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return data.qr_screenshot_url || null
}

export async function deletePlatformAccount(accountId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const resp = await fetch(`/api/platform-accounts/${accountId}`, {
    method: 'DELETE',
    headers,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`删除账号失败 (${resp.status}): ${text}`)
  }
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
  authToken?: string,
): () => void {
  const url = authToken
    ? `/api/platform-binding-sessions/${sessionId}/stream?token=${encodeURIComponent(authToken)}`
    : `/api/platform-binding-sessions/${sessionId}/stream`
  const eventSource = new EventSource(url)
  const eventMap: Record<string, keyof PlatformBindingEventHandlers> = {
    meta: 'onMeta',
    progress: 'onProgress',
    state: 'onState',
    complete: 'onComplete',
    error: 'onError',
  }

  for (const [eventName, handlerKey] of Object.entries(eventMap)) {
    eventSource.addEventListener(eventName, (event: MessageEvent) => {
      // event.data 为 undefined/null 时是浏览器原生连接错误事件，跳过解析
      if (event.data == null || event.data === 'undefined') return
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
