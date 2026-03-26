import {useCallback, useEffect, useState} from 'react'
import type {PlatformBindingSession, PlatformCatalogItem} from '@/types/openclaw'
import {
  confirmLiveLogin,
  createPlatformAccount,
  deletePlatformAccount,
  fetchBindingSession,
  fetchPlatformAccounts,
  fetchPlatformCatalog,
  getLiveLoginStatus,
  startLiveLogin,
  stopLiveLogin,
  unbindPlatformAccount,
  verifyPlatformAccount,
  type LiveLoginSession,
  type LiveLoginStatus,
  type PlatformAccountApiRow,
} from '@/services/platformAccountService'

let platformCatalogCache: PlatformCatalogItem[] | null = null
let platformCatalogRequest: Promise<PlatformCatalogItem[]> | null = null
let platformAccountsRequest: Promise<PlatformAccountApiRow[]> | null = null

async function loadPlatformCatalogCached() {
  if (platformCatalogCache) {
    return platformCatalogCache
  }

  if (!platformCatalogRequest) {
    platformCatalogRequest = fetchPlatformCatalog()
      .then((items) => {
        platformCatalogCache = items
        return items
      })
      .finally(() => {
        platformCatalogRequest = null
      })
  }

  return platformCatalogRequest
}

async function loadPlatformAccountsDeduped() {
  if (!platformAccountsRequest) {
    platformAccountsRequest = fetchPlatformAccounts().finally(() => {
      platformAccountsRequest = null
    })
  }

  return platformAccountsRequest
}

export function usePlatformAccounts() {
  const [catalog, setCatalog] = useState<PlatformCatalogItem[]>([])
  const [accounts, setAccounts] = useState<PlatformAccountApiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [catalogItems, accountItems] = await Promise.all([
        loadPlatformCatalogCached(),
        loadPlatformAccountsDeduped(),
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

  const startLiveLoginSession = useCallback(async (
    accountId: string,
    platform: string,
  ): Promise<LiveLoginSession> => {
    const session = await startLiveLogin(accountId, platform)
    return session
  }, [])

  const confirmLiveLoginSession = useCallback(async (sessionId: string) => {
    const result = await confirmLiveLogin(sessionId)
    await load()
    return result
  }, [load])

  const stopLiveLoginSession = useCallback(async (sessionId: string) => {
    await stopLiveLogin(sessionId)
    await load()
  }, [load])

  const getLiveLoginSessionStatus = useCallback(async (sessionId: string): Promise<LiveLoginStatus> => {
    return getLiveLoginStatus(sessionId)
  }, [])

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

  const deleteAccount = useCallback(async (accountId: string) => {
    await deletePlatformAccount(accountId)
    setAccounts((prev) => prev.filter((a) => a.id !== accountId))
  }, [])

  return {
    catalog,
    accounts,
    loading,
    error,
    load,
    createAccount,
    refreshSession,
    startLiveLoginSession,
    confirmLiveLoginSession,
    stopLiveLoginSession,
    getLiveLoginSessionStatus,
    startVerify,
    startUnbind,
    deleteAccount,
  }
}
