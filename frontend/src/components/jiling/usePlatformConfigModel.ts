import {useMemo} from 'react'
import {PLATFORMS} from '@/lib/constants'
import {
  getAutoVerifyCheck,
  getPreparedAccountStatus,
  getPreparedAccountStatusHint,
  getPreflightChecks,
  type PreparationCheck,
} from '@/components/jiling/jilingRecruitViewModel'
import {
  accountStatusHint,
  getLatestVerifySession,
  isBoundPlatformAccount,
  type RecruitJobOption,
} from '@/components/jiling/jilingRecruitHelpers'
import type {PlatformAccountApiRow} from '@/services/platformAccountService'

export interface RecruitPlatformCatalogItem {
  key: string
  name: string
}

export interface PlatformConfigModel {
  catalog: RecruitPlatformCatalogItem[]
  accounts: PlatformAccountApiRow[]
  accountsLoading: boolean
  selectedPlatform: string
  selectedPlatformLabel: string
  selectedPlatformAccounts: PlatformAccountApiRow[]
  selectedDefaultAccountId: string
  selectedDefaultAccount: PlatformAccountApiRow | null
  selectedAccount: PlatformAccountApiRow | null
  selectedLatestVerifySession: ReturnType<typeof getLatestVerifySession>
  selectedAccountIsBound: boolean
  selectedAccountStatusHint: string
  selectedExecJob: RecruitJobOption | null
  preparedAccount: PlatformAccountApiRow | null
  preparedAccountStatusHint: string
  preparedAccountStatus: {label: string; tone: string; description: string}
  autoVerifyCheck: PreparationCheck
  allPreparationChecks: PreparationCheck[]
  resolvedPreparationCount: number
  blockingPreparationCount: number
  strategyPreview: string
  stats: {
    totalAccounts: number
    activeAccounts: number
    inactiveAccounts: number
    activePlatformAssetCount: number
  }
}

export function usePlatformConfigModel(args: {
  catalog: RecruitPlatformCatalogItem[]
  accounts: PlatformAccountApiRow[]
  accountsLoading: boolean
  platformConfigs: Record<string, {boundProfileId?: string} | undefined>
  selectedPlatform: string
  selectedAccountId: string
  platformExecConfigs: Record<string, {accountId: string; jobId: string}>
  jobs: RecruitJobOption[]
  customMessage: string
  autoVerifyEnabled: boolean
}): PlatformConfigModel {
  const {
    catalog,
    accounts,
    accountsLoading,
    platformConfigs,
    selectedPlatform,
    selectedAccountId,
    platformExecConfigs,
    jobs,
    customMessage,
    autoVerifyEnabled,
  } = args

  const selectedPlatformAccounts = useMemo(
    () => accounts.filter((item) => item.platform === selectedPlatform),
    [accounts, selectedPlatform],
  )
  const selectedDefaultAccountId = platformConfigs[selectedPlatform]?.boundProfileId || ''
  const selectedDefaultAccount = useMemo(
    () => selectedPlatformAccounts.find((item) => item.id === selectedDefaultAccountId) || null,
    [selectedDefaultAccountId, selectedPlatformAccounts],
  )
  const selectedAccount = useMemo(
    () => selectedPlatformAccounts.find((item) => item.id === selectedAccountId) || null,
    [selectedAccountId, selectedPlatformAccounts],
  )
  const selectedLatestVerifySession = useMemo(
    () => getLatestVerifySession(selectedAccount),
    [selectedAccount],
  )
  const selectedAccountIsBound = useMemo(
    () => selectedAccount ? isBoundPlatformAccount(selectedAccount) : false,
    [selectedAccount],
  )
  const selectedAccountStatusHint = useMemo(
    () => selectedAccount ? accountStatusHint(selectedAccount) : '请选择一个账号查看详情。',
    [selectedAccount],
  )
  const selectedExecJobId = platformExecConfigs[selectedPlatform]?.jobId || ''
  const selectedExecJob = useMemo(
    () => jobs.find((item) => item.id === selectedExecJobId) || null,
    [jobs, selectedExecJobId],
  )
  const preparedAccount = selectedDefaultAccount || selectedAccount || null
  const preparedAccountStatusHint = useMemo(
    () => getPreparedAccountStatusHint(preparedAccount),
    [preparedAccount],
  )
  const preparedAccountStatus = useMemo(
    () => getPreparedAccountStatus(preparedAccount),
    [preparedAccount],
  )
  const strategyPreview = customMessage.trim() || '留空时，将沿用默认主动沟通模板。'
  const autoVerifyCheck = useMemo(
    () => getAutoVerifyCheck(autoVerifyEnabled),
    [autoVerifyEnabled],
  )
  const preflightChecks = useMemo(
    () => getPreflightChecks({
      preparedAccount,
      preparedAccountStatusHint,
      selectedDefaultAccount,
      selectedExecJob,
      customMessage,
    }),
    [customMessage, preparedAccount, preparedAccountStatusHint, selectedDefaultAccount, selectedExecJob],
  )
  const allPreparationChecks = useMemo(
    () => [...preflightChecks, autoVerifyCheck],
    [autoVerifyCheck, preflightChecks],
  )
  const resolvedPreparationCount = allPreparationChecks.filter((item) => item.tone === 'pass' || item.tone === 'saved').length
  const blockingPreparationCount = allPreparationChecks.filter((item) => item.tone === 'risk').length
  const selectedPlatformLabel = PLATFORMS[selectedPlatform as keyof typeof PLATFORMS]?.name || '未选择平台'
  const totalAccounts = accounts.length
  const activeAccounts = accounts.filter((account) => account.status === 'active').length
  const inactiveAccounts = totalAccounts - activeAccounts
  const activePlatformAssetCount = catalog.filter((item) => accounts.some((account) => account.platform === item.key && account.status === 'active')).length

  return {
    catalog,
    accounts,
    accountsLoading,
    selectedPlatform,
    selectedPlatformLabel,
    selectedPlatformAccounts,
    selectedDefaultAccountId,
    selectedDefaultAccount,
    selectedAccount,
    selectedLatestVerifySession,
    selectedAccountIsBound,
    selectedAccountStatusHint,
    selectedExecJob,
    preparedAccount,
    preparedAccountStatusHint,
    preparedAccountStatus,
    autoVerifyCheck,
    allPreparationChecks,
    resolvedPreparationCount,
    blockingPreparationCount,
    strategyPreview,
    stats: {
      totalAccounts,
      activeAccounts,
      inactiveAccounts,
      activePlatformAssetCount,
    },
  }
}
