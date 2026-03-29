import {useCallback, useEffect, useState} from 'react'
import type {PlatformCatalogItem} from '@/types/openclaw'
import {STATIC_PLATFORM_CATALOG} from '@/lib/constants'
import {
  confirmLiveLogin,
  createPlatformAccount,
  deletePlatformAccount,
  fetchPlatformAccounts,
  getLiveLoginStatus,
  startLiveLogin,
  stopLiveLogin,
  unbindPlatformAccount,
  verifyPlatformAccount,
  type LiveLoginSession,
  type LiveLoginStatus,
  type PlatformAccountApiRow,
} from '@/services/platformAccountService'

let platformAccountsRequest: Promise<PlatformAccountApiRow[]> | null = null

async function loadPlatformAccountsDeduped() {
  if (!platformAccountsRequest) {
    platformAccountsRequest = fetchPlatformAccounts().finally(() => {
      platformAccountsRequest = null
    })
  }

  return platformAccountsRequest
}

export function usePlatformAccounts() {
  const [catalog] = useState<PlatformCatalogItem[]>(STATIC_PLATFORM_CATALOG)
  const [accounts, setAccounts] = useState<PlatformAccountApiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const accountItems = await loadPlatformAccountsDeduped()
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

  const startLiveLoginSession = useCallback(async (accountId: string): Promise<LiveLoginSession> => {
    const session = await startLiveLogin(accountId)
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
    return session
  }, [])

  const startUnbind = useCallback(async (accountId: string) => {
    const session = await unbindPlatformAccount(accountId)
    return session
  }, [])

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
    startLiveLoginSession,
    confirmLiveLoginSession,
    stopLiveLoginSession,
    getLiveLoginSessionStatus,
    startVerify,
    startUnbind,
    deleteAccount,
  }
}
