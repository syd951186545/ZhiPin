import {useCallback, useEffect, useState} from 'react'
import type {PlatformBindingSession, PlatformCatalogItem, PlatformLoginMethod} from '@/types/openclaw'
import {
  createPlatformAccount,
  fetchBindingSession,
  fetchPlatformAccounts,
  fetchPlatformCatalog,
  startPlatformBind,
  submitPlatformBind,
  unbindPlatformAccount,
  verifyPlatformAccount,
  type PlatformAccountApiRow,
} from '@/services/platformAccountService'

export function usePlatformAccounts() {
  const [catalog, setCatalog] = useState<PlatformCatalogItem[]>([])
  const [accounts, setAccounts] = useState<PlatformAccountApiRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [catalogItems, accountItems] = await Promise.all([
        fetchPlatformCatalog(),
        fetchPlatformAccounts(),
      ])
      setCatalog(catalogItems)
      setAccounts(accountItems)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载平台账号失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const createAccount = useCallback(async (payload: {
    platform: string
    name: string
    account_name?: string
    platform_url?: string
  }) => {
    const created = await createPlatformAccount(payload)
    setAccounts((prev) => [...prev, created])
    return created
  }, [])

  const refreshSession = useCallback(async (sessionId: string): Promise<PlatformBindingSession> => {
    const session = await fetchBindingSession(sessionId)
    await load()
    return session
  }, [load])

  const startBind = useCallback(async (
    accountId: string,
    payload: {login_method: PlatformLoginMethod; phone?: string; login_name?: string; password?: string},
  ) => {
    const session = await startPlatformBind(accountId, payload)
    await load()
    return session
  }, [load])

  const submitBind = useCallback(async (
    sessionId: string,
    payload: {verification_code?: string; secondary_code?: string; password?: string},
  ) => {
    const session = await submitPlatformBind(sessionId, payload)
    await load()
    return session
  }, [load])

  const startVerify = useCallback(async (accountId: string) => {
    const session = await verifyPlatformAccount(accountId)
    await load()
    return session
  }, [load])

  const startUnbind = useCallback(async (accountId: string) => {
    const session = await unbindPlatformAccount(accountId)
    await load()
    return session
  }, [load])

  return {
    catalog,
    accounts,
    loading,
    error,
    load,
    createAccount,
    refreshSession,
    startBind,
    submitBind,
    startVerify,
    startUnbind,
  }
}
