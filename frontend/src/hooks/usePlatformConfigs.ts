/**
 * usePlatformConfigs
 *
 * 管理 Supabase platform_configs 表中的平台账号数据。
 * 每行对应一个平台账号（PlatformProfile），支持增删改查。
 * 加载后同步到 useSettingsStore.platformProfiles（供 Automation 页面使用）。
 */

import {useCallback, useEffect, useState} from 'react'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/contexts/AuthContext'
import {useSettingsStore} from '@/stores/useSettingsStore'
import type {PlatformKey, PlatformProfile} from '@/types/openclaw'

export interface PlatformConfigRow {
  id: string
  tenant_id: string
  platform: PlatformKey
  name: string
  account_name: string | null
  config: Record<string, unknown>
  is_connected: boolean
  status: 'active' | 'needsLogin' | 'verifying' | 'expired'
  last_verified: string | null
  last_login: string | null
  created_at: string
  updated_at: string
}

function rowToProfile(row: PlatformConfigRow): PlatformProfile {
  return {
    id: row.id,
    name: row.name || row.account_name || row.platform,
    platform: row.platform,
    status: row.status,
    accountName: row.account_name || undefined,
    lastVerified: row.last_verified || undefined,
    lastLogin: row.last_login || undefined,
  }
}

export function usePlatformConfigs() {
  const {user} = useAuth()
  const {updateProfile, addProfile, removeProfile} = useSettingsStore()
  const [rows, setRows] = useState<PlatformConfigRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── 从 Supabase 加载并同步到 store ──────────────────────
  const load = useCallback(async () => {
    if (!user?.tenantId) return
    setLoading(true)
    setError(null)
    try {
      const {data, error: err} = await supabase
        .from('platform_configs')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .order('created_at', {ascending: true})

      if (err) throw err

      const dbRows = (data || []) as PlatformConfigRow[]
      setRows(dbRows)

      // 将数据库行全量同步到 settingsStore（覆盖 localStorage 中的旧数据）
      const store = useSettingsStore.getState()
      const existingIds = new Set(store.platformProfiles.map((p) => p.id))

      for (const row of dbRows) {
        const profile = rowToProfile(row)
        if (existingIds.has(row.id)) {
          updateProfile(row.id, profile)
        } else {
          addProfile(profile)
        }
      }

      // 删除 store 中已不在数据库里的条目（可能已被其他端删除）
      const dbIds = new Set(dbRows.map((r) => r.id))
      for (const p of store.platformProfiles) {
        if (!dbIds.has(p.id)) {
          removeProfile(p.id)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载平台账号失败')
    } finally {
      setLoading(false)
    }
  }, [user?.tenantId, addProfile, updateProfile, removeProfile])

  useEffect(() => {
    load()
  }, [load])

  // ── 新增账号 ────────────────────────────────────────────
  const addAccount = useCallback(async (
    platform: PlatformKey,
    name: string,
    accountName?: string,
  ): Promise<PlatformConfigRow | null> => {
    if (!user?.tenantId) return null
    const {data, error: err} = await supabase
      .from('platform_configs')
      .insert({
        tenant_id: user.tenantId,
        platform,
        name,
        account_name: accountName || null,
        status: 'needsLogin',
        is_connected: false,
        config: {},
      })
      .select()
      .single()

    if (err) throw err

    const row = data as PlatformConfigRow
    setRows((prev) => [...prev, row])
    addProfile(rowToProfile(row))
    return row
  }, [user?.tenantId, addProfile])

  // ── 更新账号 ────────────────────────────────────────────
  const updateAccount = useCallback(async (
    id: string,
    patch: Partial<Pick<PlatformConfigRow, 'name' | 'account_name' | 'status' | 'is_connected' | 'last_login' | 'last_verified' | 'config'>>,
  ) => {
    const {error: err} = await supabase
      .from('platform_configs')
      .update(patch)
      .eq('id', id)

    if (err) throw err

    setRows((prev) => prev.map((r) => r.id === id ? {...r, ...patch} : r))

    // 同步到 store
    const profilePatch: Partial<PlatformProfile> = {}
    if (patch.name !== undefined) profilePatch.name = patch.name
    if (patch.account_name !== undefined) profilePatch.accountName = patch.account_name || undefined
    if (patch.status !== undefined) profilePatch.status = patch.status
    if (patch.last_login !== undefined) profilePatch.lastLogin = patch.last_login || undefined
    if (patch.last_verified !== undefined) profilePatch.lastVerified = patch.last_verified || undefined
    if (Object.keys(profilePatch).length > 0) {
      updateProfile(id, profilePatch)
    }
  }, [updateProfile])

  // ── 删除账号 ────────────────────────────────────────────
  const deleteAccount = useCallback(async (id: string) => {
    const {error: err} = await supabase
      .from('platform_configs')
      .delete()
      .eq('id', id)

    if (err) throw err

    setRows((prev) => prev.filter((r) => r.id !== id))
    removeProfile(id)
  }, [removeProfile])

  return {rows, loading, error, load, addAccount, updateAccount, deleteAccount}
}
