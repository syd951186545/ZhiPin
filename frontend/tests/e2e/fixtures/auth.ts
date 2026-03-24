import type { Page } from '@playwright/test'

export interface MockUser {
  id: string
  email: string
  name: string
  tenantId: string
  role: string
}

export const defaultMockUser: MockUser = {
  id: 'user-1',
  email: 'hr@example.com',
  name: '测试招聘管理员',
  tenantId: 'tenant-1',
  role: 'admin',
}

const STORAGE_KEY = 'sb-nlmnoiuycjrjwvoezkdb-auth-token'

export function buildSupabaseSession(user: MockUser = defaultMockUser) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: {
      id: user.id,
      email: user.email,
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: user.name },
    },
  }
}

export async function installAuthenticatedSession(page: Page, user: MockUser = defaultMockUser) {
  const session = buildSupabaseSession(user)
  await page.addInitScript(
    ({ storageKey, serializedSession }) => {
      window.localStorage.setItem(storageKey, serializedSession)
    },
    {
      storageKey: STORAGE_KEY,
      serializedSession: JSON.stringify(session),
    },
  )
}
