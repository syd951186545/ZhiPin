/**
 * useTenantSettings
 *
 * 从 Supabase tenant_settings 加载并保存租户设置（含企业信息）。
 * 初次加载后将数据同步到 useSettingsStore（localStorage 缓存），
 * 保存时同时写入 Supabase 与 localStorage。
 */

import {useCallback, useEffect, useState} from 'react'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/contexts/AuthContext'
import {useSettingsStore} from '@/stores/useSettingsStore'

export interface TenantSettingsRow {
  id: string
  tenant_id: string
  company_name: string
  company_address: string
  company_size: string
  company_overview: string
  ai_model: string
  ai_api_key: string | null
  ai_validation_status: string
  ai_validation_message: string | null
  ai_validated_at: string | null
  notification_wecom_url: string | null
  notification_email: string | null
  audit_logging: boolean
  data_retention_days: number
}

export function useTenantSettings() {
  const {user} = useAuth()
  const {updateCompanyProfile, updateNotifications} = useSettingsStore()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<TenantSettingsRow | null>(null)

  const load = useCallback(async () => {
    if (!user?.tenantId) return
    setLoading(true)
    setError(null)
    try {
      const {data, error: err} = await supabase
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .single()

      if (err) throw err

      setSettings(data as TenantSettingsRow)

      // 同步企业信息到 localStorage store
      updateCompanyProfile({
        name: data.company_name || '',
        address: data.company_address || '',
        size: data.company_size || '',
        overview: data.company_overview || '',
      })

      // 同步通知设置
      updateNotifications({
        wecomUrl: data.notification_wecom_url || '',
        notifEmail: data.notification_email || '',
        auditLogging: data.audit_logging ?? true,
        retentionDays: data.data_retention_days ?? 90,
      })

    } catch (e) {
      setError(e instanceof Error ? e.message : '加载设置失败')
    } finally {
      setLoading(false)
    }
  }, [user?.tenantId, updateCompanyProfile, updateNotifications])

  useEffect(() => {
    load()
  }, [load])

  const saveCompanyProfile = useCallback(async (company: {
    name: string
    address: string
    size: string
    overview: string
  }) => {
    if (!user?.tenantId) return
    setSaving(true)
    setError(null)
    try {
      const {error: err} = await supabase
        .from('tenant_settings')
        .update({
          company_name: company.name,
          company_address: company.address,
          company_size: company.size,
          company_overview: company.overview,
        })
        .eq('tenant_id', user.tenantId)

      if (err) throw err

      // 同步到本地 store
      updateCompanyProfile(company)
      setSettings((prev) => prev ? {
        ...prev,
        company_name: company.name,
        company_address: company.address,
        company_size: company.size,
        company_overview: company.overview,
      } : prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
      throw e
    } finally {
      setSaving(false)
    }
  }, [user?.tenantId, updateCompanyProfile])

  const saveNotifications = useCallback(async (notif: {
    wecomUrl?: string
    notifEmail?: string
    auditLogging?: boolean
    retentionDays?: number
  }) => {
    if (!user?.tenantId) return
    setSaving(true)
    setError(null)
    try {
      const patch: Record<string, unknown> = {}
      if (notif.wecomUrl !== undefined) patch.notification_wecom_url = notif.wecomUrl || null
      if (notif.notifEmail !== undefined) patch.notification_email = notif.notifEmail || null
      if (notif.auditLogging !== undefined) patch.audit_logging = notif.auditLogging
      if (notif.retentionDays !== undefined) patch.data_retention_days = notif.retentionDays

      const {error: err} = await supabase
        .from('tenant_settings')
        .update(patch)
        .eq('tenant_id', user.tenantId)

      if (err) throw err
      updateNotifications(notif)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
      throw e
    } finally {
      setSaving(false)
    }
  }, [user?.tenantId, updateNotifications])

  return {settings, loading, saving, error, load, saveCompanyProfile, saveNotifications}
}
