import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  AlertCircle, CheckCircle2, Download, ExternalLink, Link as LinkIcon, Loader2, LogIn, RefreshCw, Save, Server, ShieldCheck, Unplug, UserPlus,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Slider} from '@/components/ui/slider'
import {Switch} from '@/components/ui/switch'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {Textarea} from '@/components/ui/textarea'
import PageHeader from '@/components/shared/PageHeader'
import {useI18n} from '@/contexts/I18nContext'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import {useTenantSettings} from '@/hooks/useTenantSettings'
import {PLATFORMS} from '@/lib/constants'
import {cn} from '@/lib/utils'
import {supabase} from '@/lib/supabase'
import {useSettingsStore} from '@/stores/useSettingsStore'
import AddProfileDialog from '@/components/settings/AddProfileDialog'
import PlatformLoginDialog from '@/components/settings/PlatformLoginDialog'
import {Badge} from '@/components/ui/badge'

interface ServerConfig {
  provider: string
  baseUrl: string
  model: string
  apiKeyMasked: string
  hasApiKey: boolean
  hasStoredApiKey: boolean
  availableModels?: Array<{
    provider: string
    models: Array<{value: string; label: string}>
  }>
  validationStatus: string
  validationMessage: string
  validatedAt: string | null
}

interface SaveServerResponse {
  success: boolean
  message: string
  restarted: boolean
  validationStatus: string
  validationMessage: string
  validatedAt: string | null
  apiKeyMasked: string
}

type SaveStatus = 'idle' | 'loading' | 'success' | 'error'
type ModelOption = {value: string; label: string}
type ModelGroup = {provider: string; models: ModelOption[]}

const OFFICIAL_OPENCLAW_MODEL_CATALOG: ModelGroup[] = [
  {
    provider: 'anthropic',
    models: [
      {value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6'},
    ],
  },
  {
    provider: 'byteplus',
    models: [
      {value: 'byteplus/seed-1-8-251228', label: 'Seed 1.8'},
      {value: 'byteplus/kimi-k2-5-260127', label: 'Kimi K2.5'},
      {value: 'byteplus/glm-4-7-251222', label: 'GLM 4.7'},
    ],
  },
  {
    provider: 'byteplus-plan',
    models: [
      {value: 'byteplus-plan/ark-code-latest', label: 'ARK Code Latest'},
      {value: 'byteplus-plan/doubao-seed-code', label: 'Doubao Seed Code'},
      {value: 'byteplus-plan/kimi-k2.5', label: 'Kimi K2.5'},
      {value: 'byteplus-plan/kimi-k2-thinking', label: 'Kimi K2 Thinking'},
      {value: 'byteplus-plan/glm-4.7', label: 'GLM 4.7'},
    ],
  },
  {
    provider: 'google',
    models: [
      {value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview'},
      {value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview'},
    ],
  },
  {
    provider: 'huggingface',
    models: [
      {value: 'huggingface/deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1'},
    ],
  },
  {
    provider: 'kilocode',
    models: [
      {value: 'kilocode/anthropic/claude-opus-4.6', label: 'Claude Opus 4.6'},
      {value: 'kilocode/glm-5-free', label: 'GLM-5 Free'},
      {value: 'kilocode/minimax-m2.5-free', label: 'MiniMax M2.5 Free'},
      {value: 'kilocode/gpt-5.2', label: 'GPT-5.2'},
      {value: 'kilocode/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview'},
      {value: 'kilocode/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview'},
      {value: 'kilocode/grok-code-fast-1', label: 'Grok Code Fast 1'},
      {value: 'kilocode/kimi-k2.5', label: 'Kimi K2.5'},
    ],
  },
  {
    provider: 'kimi-coding',
    models: [
      {value: 'kimi-coding/k2p5', label: 'K2.5'},
    ],
  },
  {
    provider: 'minimax-cn',
    models: [
      {value: 'minimax-cn/MiniMax-M2.5', label: 'MiniMax M2.5'},
      {value: 'minimax-cn/MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed'},
    ],
  },
  {
    provider: 'minimax',
    models: [
      {value: 'minimax/MiniMax-M2.5', label: 'MiniMax M2.5'},
      {value: 'minimax/MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed'},
    ],
  },
  {
    provider: 'mistral',
    models: [
      {value: 'mistral/mistral-large-latest', label: 'Mistral Large Latest'},
    ],
  },
  {
    provider: 'moonshot',
    models: [
      {value: 'moonshot/kimi-k2.5', label: 'Kimi K2.5'},
      {value: 'moonshot/kimi-k2-0905-preview', label: 'Kimi K2 0905 Preview'},
      {value: 'moonshot/kimi-k2-turbo-preview', label: 'Kimi K2 Turbo Preview'},
      {value: 'moonshot/kimi-k2-thinking', label: 'Kimi K2 Thinking'},
      {value: 'moonshot/kimi-k2-thinking-turbo', label: 'Kimi K2 Thinking Turbo'},
    ],
  },
  {
    provider: 'ollama',
    models: [
      {value: 'ollama/llama3.3', label: 'Llama 3.3'},
      {value: 'ollama/deepseek-r1:32b', label: 'DeepSeek R1 32B'},
      {value: 'ollama/qwen2.5-coder:32b', label: 'Qwen2.5 Coder 32B'},
    ],
  },
  {
    provider: 'opencode',
    models: [
      {value: 'opencode/claude-opus-4-6', label: 'Claude Opus 4.6'},
      {value: 'opencode/gpt-5.2', label: 'GPT-5.2'},
      {value: 'opencode/gemini-3-pro', label: 'Gemini 3 Pro'},
    ],
  },
  {
    provider: 'opencode-go',
    models: [
      {value: 'opencode-go/kimi-k2.5', label: 'Kimi K2.5'},
      {value: 'opencode-go/glm-5', label: 'GLM-5'},
      {value: 'opencode-go/minimax-m2.5', label: 'MiniMax M2.5'},
    ],
  },
  {
    provider: 'openai',
    models: [
      {value: 'openai/gpt-5.4', label: 'GPT-5.4'},
      {value: 'openai/gpt-5.4-pro', label: 'GPT-5.4 Pro'},
    ],
  },
  {
    provider: 'openai-codex',
    models: [
      {value: 'openai-codex/gpt-5.4', label: 'GPT-5.4'},
      {value: 'openai-codex/gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark'},
    ],
  },
  {
    provider: 'openrouter',
    models: [
      {value: 'openrouter/anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5'},
    ],
  },
  {
    provider: 'qwen-portal',
    models: [
      {value: 'qwen-portal/coder-model', label: 'Coder Model'},
      {value: 'qwen-portal/vision-model', label: 'Vision Model'},
    ],
  },
  {
    provider: 'synthetic',
    models: [
      {value: 'synthetic/hf:MiniMaxAI/MiniMax-M2.5', label: 'MiniMax M2.5'},
    ],
  },
  {
    provider: 'vercel-ai-gateway',
    models: [
      {value: 'vercel-ai-gateway/anthropic/claude-opus-4.6', label: 'Claude Opus 4.6'},
    ],
  },
  {
    provider: 'volcengine',
    models: [
      {value: 'volcengine/doubao-seed-1-8-251228', label: 'Doubao Seed 1.8'},
      {value: 'volcengine/doubao-seed-code-preview-251028', label: 'Doubao Seed Code Preview'},
      {value: 'volcengine/kimi-k2-5-260127', label: 'Kimi K2.5'},
      {value: 'volcengine/glm-4-7-251222', label: 'GLM 4.7'},
      {value: 'volcengine/deepseek-v3-2-251201', label: 'DeepSeek V3.2 128K'},
    ],
  },
  {
    provider: 'volcengine-plan',
    models: [
      {value: 'volcengine-plan/ark-code-latest', label: 'ARK Code Latest'},
      {value: 'volcengine-plan/doubao-seed-code', label: 'Doubao Seed Code'},
      {value: 'volcengine-plan/kimi-k2.5', label: 'Kimi K2.5'},
      {value: 'volcengine-plan/kimi-k2-thinking', label: 'Kimi K2 Thinking'},
      {value: 'volcengine-plan/glm-4.7', label: 'GLM 4.7'},
    ],
  },
  {
    provider: 'zai',
    models: [
      {value: 'zai/glm-5', label: 'GLM-5'},
      {value: 'zai/glm-4.7', label: 'GLM-4.7'},
      {value: 'zai/glm-4.6', label: 'GLM-4.6'},
    ],
  },
]

async function getAuthHeaders() {
  const {data, error} = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('登录状态已失效，请重新登录')
  return {Authorization: `Bearer ${token}`}
}

export default function Settings() {
  const {t} = useI18n()

  const {
    proxyList, delayEnabled, mouseSimulation, headless,
    wecomUrl, notifEmail, auditLogging, retentionDays,
    updateProxy, updateAI, updateNotifications,
  } = useSettingsStore()

  // Platform accounts
  const {accounts, loading: accountsLoading, startVerify, startUnbind, load: reloadAccounts} = usePlatformAccounts()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [bindDialogOpen, setBindDialogOpen] = useState(false)
  const [bindAccountId, setBindAccountId] = useState<string | null>(null)
  const [platformActionPending, setPlatformActionPending] = useState<string | null>(null)

  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null)
  const [serverLoading, setServerLoading] = useState(false)
  const [editModel, setEditModel] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveMessage, setSaveMessage] = useState('')

  const fetchServerConfig = useCallback(async () => {
    setServerLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/settings/openclaw', {headers})
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '加载 AI 配置失败')
      setServerConfig(data as ServerConfig)
      const nextModel = (data as ServerConfig).model || ''
      setEditModel(nextModel)
      updateAI({aiModel: nextModel})
    } catch (error) {
      console.warn('获取 AI 配置失败:', error)
      setServerConfig(null)
    } finally {
      setServerLoading(false)
    }
  }, [updateAI])

  useEffect(() => {
    fetchServerConfig()
  }, [fetchServerConfig])

  const handleSaveServerConfig = async () => {
    if (!editModel.trim()) return
    setSaveStatus('loading')
    setSaveMessage('')
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      }
      const body: Record<string, string> = {model: editModel.trim()}
      if (editApiKey.trim()) body.apiKey = editApiKey.trim()

      const res = await fetch('/api/settings/openclaw', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.detail || data.validationMessage || data.message || '保存失败')

      const result = data as SaveServerResponse
      setSaveStatus('success')
      setSaveMessage(result.validationMessage || result.message)
      setEditApiKey('')
      updateAI({aiModel: editModel.trim()})
      await fetchServerConfig()
    } catch (error) {
      setSaveStatus('error')
      setSaveMessage(error instanceof Error ? error.message : '保存失败，请检查后端日志')
    } finally {
      setTimeout(() => setSaveStatus('idle'), 8000)
    }
  }

  const modelGroups = useMemo(() => {
    const groups = OFFICIAL_OPENCLAW_MODEL_CATALOG.map((group) => ({
      provider: group.provider,
      models: [...group.models],
    }))

    const currentModel = editModel.trim()
    if (!currentModel) return groups

    const exists = groups.some((group) => group.models.some((item) => item.value === currentModel))
    if (exists) return groups

    groups.unshift({
      provider: 'current',
      models: [{value: currentModel, label: `${currentModel.split('/').pop() || currentModel}（当前配置）`}],
    })
    return groups
  }, [editModel])
  const modelValueSet = useMemo(
    () => new Set(modelGroups.flatMap((group) => group.models.map((item) => item.value))),
    [modelGroups]
  )
  const selectedModelValue = editModel && modelValueSet.has(editModel) ? editModel : undefined

  const {saveNotifications} = useTenantSettings()
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSaveStatus, setNotifSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleSaveNotifications = async () => {
    setNotifSaving(true)
    try {
      await saveNotifications({wecomUrl, notifEmail, auditLogging, retentionDays})
      setNotifSaveStatus('success')
    } catch {
      setNotifSaveStatus('error')
    } finally {
      setNotifSaving(false)
      setTimeout(() => setNotifSaveStatus('idle'), 4000)
    }
  }

  const validationTone = serverConfig?.validationStatus === 'success'
    ? 'text-green-600 dark:text-green-400'
    : serverConfig?.validationStatus === 'error'
      ? 'text-destructive'
      : 'text-muted-foreground'
  const maskedApiKey = serverConfig?.apiKeyMasked?.trim() || ''
  const hasMaskedApiKey = maskedApiKey.length > 0

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} description={t('settings.desc')}/>

      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="ai">{t('settings.tab.ai')}</TabsTrigger>
          <TabsTrigger value="proxy">{t('settings.tab.proxy')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('settings.tab.notifications')}</TabsTrigger>
          <TabsTrigger value="platform">平台账号</TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.ai.title')}</CardTitle>
              <CardDescription>{t('settings.ai.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t('settings.ai.model')}</Label>
                <p className="text-xs text-muted-foreground">当前值从 OpenClaw Gateway 运行时配置读取；模型列表使用前端预置清单并按厂商分组展示。</p>
                <Select
                  value={selectedModelValue}
                  onValueChange={setEditModel}
                  disabled={serverLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={serverLoading ? '加载模型列表中...' : '选择 AI 模型'} />
                  </SelectTrigger>
                  <SelectContent>
                    {modelGroups.map((group, index) => (
                      <React.Fragment key={group.provider}>
                        <SelectGroup>
                          <SelectLabel className="px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                            {group.provider}
                          </SelectLabel>
                          {group.models.map((item) => (
                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                          ))}
                        </SelectGroup>
                        {index < modelGroups.length - 1 && <SelectSeparator className="my-1 h-px bg-border" />}
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>当前已配对 API Key</Label>
                <p className="text-xs text-muted-foreground">从 OpenClaw Gateway 当前运行时配置读取。仅展示前后几位，页面中不可复制；切换到其他厂商模型时需填写对应新 Key。</p>
                <div
                  className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-mono select-none"
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                >
                  {hasMaskedApiKey ? maskedApiKey : '未配置'}
                </div>
              </div>

              <div className="space-y-2">
                <Label>更新 API Key</Label>
                <p className="text-xs text-muted-foreground">留空表示沿用 Gateway 当前已配置的 Key；填写后会先校验可用性，通过后才会保存。</p>
                <Input
                  type="password"
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                  placeholder={hasMaskedApiKey || serverConfig?.hasStoredApiKey ? '输入新 Key 以替换当前配置' : '请输入 API Key'}
                  autoComplete="new-password"
                  className="font-mono text-sm"
                />
              </div>

              <div className="rounded-md border bg-muted/30 p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">当前 Provider</span>
                  <span className="font-mono">{serverConfig?.provider || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Gateway Base URL</span>
                  <span className="max-w-[260px] truncate font-mono">{serverConfig?.baseUrl || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">最近验证</span>
                  <span className={validationTone}>{serverConfig?.validationMessage || '尚未验证'}</span>
                </div>
                {serverConfig?.validatedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">验证时间</span>
                    <span className="font-mono">{new Date(serverConfig.validatedAt).toLocaleString('zh-CN')}</span>
                  </div>
                )}
              </div>

              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">OpenClaw 运行时同步</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={fetchServerConfig} disabled={serverLoading}>
                    <RefreshCw className={`h-3.5 w-3.5 ${serverLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                {saveStatus !== 'idle' && saveMessage && (
                  <div className={`flex items-start gap-2 rounded-md p-3 text-xs ${
                    saveStatus === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400' :
                    saveStatus === 'error' ? 'bg-destructive/10 text-destructive' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {saveStatus === 'success' && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    {saveStatus === 'error' && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    {saveStatus === 'loading' && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />}
                    <span>{saveMessage}</span>
                  </div>
                )}

                <Button
                  onClick={handleSaveServerConfig}
                  disabled={saveStatus === 'loading' || !editModel.trim()}
                  className="w-full"
                  size="sm"
                >
                  {saveStatus === 'loading'
                    ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />校验并保存中...</>
                    : <><Save className="mr-2 h-3.5 w-3.5" />保存到数据库并同步 OpenClaw</>
                  }
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proxy">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.proxy.title')}</CardTitle>
              <CardDescription>{t('settings.proxy.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t('settings.proxy.pool')}</Label>
                <Textarea
                  value={proxyList}
                  onChange={(e) => updateProxy({proxyList: e.target.value})}
                  placeholder={'socks5://127.0.0.1:1080\nhttp://proxy.example.com:8080'}
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium text-sm">{t('settings.proxy.delay')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.proxy.delayDesc')}</p>
                  </div>
                  <Switch checked={delayEnabled} onCheckedChange={(v) => updateProxy({delayEnabled: v})}/>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium text-sm">{t('settings.proxy.mouse')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.proxy.mouseDesc')}</p>
                  </div>
                  <Switch checked={mouseSimulation} onCheckedChange={(v) => updateProxy({mouseSimulation: v})}/>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium text-sm">{t('settings.proxy.headless')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.proxy.headlessDesc')}</p>
                  </div>
                  <Switch checked={headless} onCheckedChange={(v) => updateProxy({headless: v})}/>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.notifications.title')}</CardTitle>
              <CardDescription>{t('settings.notifications.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="mb-4 text-sm font-medium">{t('settings.notifications.channels')}</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('settings.notifications.wecom')}</Label>
                    <p className="text-xs text-muted-foreground">{t('settings.notifications.wecomDesc')}</p>
                    <Input
                      value={wecomUrl}
                      onChange={(e) => updateNotifications({wecomUrl: e.target.value})}
                      placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('settings.notifications.email')}</Label>
                    <p className="text-xs text-muted-foreground">{t('settings.notifications.emailDesc')}</p>
                    <Input
                      type="email"
                      value={notifEmail}
                      onChange={(e) => updateNotifications({notifEmail: e.target.value})}
                      placeholder="admin@company.com"
                    />
                  </div>
                </div>
              </div>
              <div>
                <h3 className="mb-4 text-sm font-medium">{t('settings.notifications.security')}</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium text-sm">{t('settings.notifications.audit')}</p>
                      <p className="text-xs text-muted-foreground">{t('settings.notifications.auditDesc')}</p>
                    </div>
                    <Switch checked={auditLogging} onCheckedChange={(v) => updateNotifications({auditLogging: v})}/>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>{t('settings.notifications.retention')}</Label>
                        <p className="text-xs text-muted-foreground">{t('settings.notifications.retentionDesc')}</p>
                      </div>
                      <span className="text-sm font-mono font-medium">{retentionDays} 天</span>
                    </div>
                    <Slider
                      value={[retentionDays]}
                      onValueChange={([v]) => updateNotifications({retentionDays: v})}
                      min={7}
                      max={365}
                      step={1}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex items-center gap-3">
              <Button onClick={handleSaveNotifications} disabled={notifSaving} size="sm">
                {notifSaving
                  ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin"/>保存中...</>
                  : <><Save className="mr-2 h-3.5 w-3.5"/>保存通知设置</>
                }
              </Button>
              {notifSaveStatus !== 'idle' && (
                <span className={`flex items-center gap-1 text-xs ${notifSaveStatus === 'success' ? 'text-green-600' : 'text-destructive'}`}>
                  {notifSaveStatus === 'success'
                    ? <><CheckCircle2 className="h-3.5 w-3.5"/>已保存到云端</>
                    : <><AlertCircle className="h-3.5 w-3.5"/>保存失败</>
                  }
                </span>
              )}
              <Button variant="outline" size="sm" className="ml-auto">
                <Download className="mr-2 h-4 w-4"/>
                {t('settings.notifications.export')}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="platform">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>平台账号管理</CardTitle>
                <CardDescription>绑定招聘平台账号，支持验证登录状态和解绑操作。</CardDescription>
              </div>
              <Button size="sm" className="gap-2 shadow-sm" onClick={() => setAddDialogOpen(true)}>
                <UserPlus className="h-4 w-4"/>新增账号
              </Button>
            </CardHeader>
            <CardContent>
              {accountsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin"/>加载中...
                </div>
              ) : accounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <LinkIcon className="h-5 w-5 text-muted-foreground"/>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">暂无平台账号</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">点击「新增账号」添加第一个招聘平台</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((account) => {
                    const platformInfo = PLATFORMS[account.platform as keyof typeof PLATFORMS]
                    const isPending = platformActionPending === account.id
                    return (
                      <div key={account.id} className="flex items-center justify-between gap-4 rounded-xl border p-4 transition-all hover:shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white shrink-0',
                            account.platform === 'boss_zhipin' ? 'bg-cyan-500' :
                            account.platform === '58' ? 'bg-orange-500' :
                            account.platform === 'liepin' ? 'bg-red-500' :
                            account.platform === 'zhilian' ? 'bg-blue-600' :
                            account.platform === '51job' ? 'bg-indigo-500' :
                            account.platform === 'lagou' ? 'bg-emerald-500' : 'bg-zinc-500',
                          )}>
                            {(platformInfo?.name || account.platform).charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{account.name}</p>
                              <Badge
                                className={cn(
                                  'border-0 text-[10px]',
                                  account.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                                  account.status === 'verifying' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                  account.status === 'expired' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                  'bg-muted text-muted-foreground',
                                )}
                              >
                                {account.status === 'active' ? '已绑定' : account.status === 'verifying' ? '处理中' : account.status === 'expired' ? '已失效' : '待绑定'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {platformInfo?.name || account.platform} · {account.accountName || account.loginIdentifierMasked || '未设置登录名'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 gap-1.5 px-2.5 text-xs shadow-sm"
                            onClick={() => { setBindAccountId(account.id); setBindDialogOpen(true) }}
                          >
                            <LogIn className="h-3 w-3"/>绑定
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 px-2.5 text-xs"
                            disabled={isPending}
                            onClick={async () => {
                              setPlatformActionPending(account.id)
                              try {
                                await startVerify(account.id)
                                setBindAccountId(account.id)
                                setBindDialogOpen(true)
                              } catch {}
                              setPlatformActionPending(null)
                            }}
                          >
                            {isPending ? <Loader2 className="h-3 w-3 animate-spin"/> : <ShieldCheck className="h-3 w-3"/>}
                            验证
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2.5 text-xs text-red-600 hover:text-red-600 dark:text-red-400"
                            disabled={isPending}
                            onClick={async () => {
                              setPlatformActionPending(account.id)
                              try {
                                await startUnbind(account.id)
                                setBindAccountId(account.id)
                                setBindDialogOpen(true)
                              } catch {}
                              setPlatformActionPending(null)
                            }}
                          >
                            <Unplug className="h-3 w-3"/>解绑
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <AddProfileDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onCreated={reloadAccounts}/>
          <PlatformLoginDialog open={bindDialogOpen} onOpenChange={setBindDialogOpen} profileId={bindAccountId} onDataChanged={reloadAccounts}/>
        </TabsContent>
      </Tabs>
    </div>
  )
}
