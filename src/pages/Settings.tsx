import React, {useCallback, useEffect, useState} from 'react'
import {
  Download, RefreshCw, Save, Server, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Switch} from '@/components/ui/switch'
import {Slider} from '@/components/ui/slider'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import PageHeader from '@/components/shared/PageHeader'
import {useI18n} from '@/contexts/I18nContext'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {Input} from '@/components/ui/input'

// ── 服务器配置状态类型 ────────────────────────────────────────
interface ServerConfig {
  provider: string
  baseUrl: string
  model: string
  apiKeyMasked: string
  hasApiKey: boolean
}

type SaveStatus = 'idle' | 'loading' | 'success' | 'error'

export default function Settings() {
  const {t} = useI18n()

  // ── 服务器配置状态 ────────────────────────────────────────
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null)
  const [serverLoading, setServerLoading] = useState(false)
  const [editModel, setEditModel] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveMessage, setSaveMessage] = useState('')

  const fetchServerConfig = useCallback(async () => {
    setServerLoading(true)
    try {
      const res = await fetch('/api/settings/openclaw')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ServerConfig = await res.json()
      setServerConfig(data)
      setEditModel(data.model)
    } catch (e) {
      console.warn('获取服务器配置失败:', e)
      setServerConfig(null)
    } finally {
      setServerLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchServerConfig()
  }, [fetchServerConfig])

  const handleSaveServerConfig = async () => {
    if (!editModel.trim()) return
    setSaveStatus('loading')
    setSaveMessage('')
    try {
      const body: Record<string, string> = {model: editModel.trim()}
      if (editApiKey.trim()) body.apiKey = editApiKey.trim()

      const res = await fetch('/api/settings/openclaw', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || '保存失败')

      setSaveStatus('success')
      setSaveMessage(data.message)
      setEditApiKey('')  // 清空 Key 输入框（已保存）
      await fetchServerConfig()  // 刷新显示
    } catch (e: unknown) {
      setSaveStatus('error')
      setSaveMessage(e instanceof Error ? e.message : '保存失败，请检查后端日志')
    } finally {
      setTimeout(() => setSaveStatus('idle'), 8000)
    }
  }

  // Settings store (persisted to localStorage)
  const {
    agentId,
    proxyList, delayEnabled, mouseSimulation, headless,
    aiModel, aiTemperature, aiSystemPrompt,
    wecomUrl, notifEmail, auditLogging, retentionDays,
    updateProxy, updateAI, updateNotifications,
  } = useSettingsStore()

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} description={t('settings.desc')}/>

      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="ai">{t('settings.tab.ai')}</TabsTrigger>
          <TabsTrigger value="proxy">{t('settings.tab.proxy')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('settings.tab.notifications')}</TabsTrigger>
        </TabsList>

        {/* Tab 2: AI Settings */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.ai.title')}</CardTitle>
              <CardDescription>{t('settings.ai.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t('settings.ai.agentId')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.ai.agentIdDesc')}</p>
                <Input value={agentId || '-'} disabled />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.ai.model')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.ai.modelDesc')}</p>
                <Select value={aiModel} onValueChange={(v) => updateAI({aiModel: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MiniMax-M2.5">MiniMax M2.5</SelectItem>
                    <SelectItem value="MiniMax-abab6.5-chat">MiniMax-abab6.5-chat</SelectItem>
                    <SelectItem value="MiniMax-abab5.5-chat">MiniMax-abab5.5-chat</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                    <SelectItem value="deepseek-v3">DeepSeek V3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('settings.ai.temperature')}</Label>
                    <p className="text-xs text-muted-foreground">{t('settings.ai.temperatureDesc')}</p>
                  </div>
                  <span className="text-sm font-mono font-medium">{aiTemperature.toFixed(1)}</span>
                </div>
                <Slider
                  value={[aiTemperature]}
                  onValueChange={([v]) => updateAI({aiTemperature: v})}
                  min={0}
                  max={1}
                  step={0.1}
                  className="mt-2"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.ai.systemPrompt')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.ai.systemPromptDesc')}</p>
                <Textarea
                  value={aiSystemPrompt}
                  onChange={(e) => updateAI({aiSystemPrompt: e.target.value})}
                  placeholder="例如：请优先推荐有大型项目经验的候选人，重点关注技术能力和团队协作经验..."
                  rows={4}
                />
              </div>

              {/* ── OpenClaw 服务器配置 ─────────────────────── */}
              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">OpenClaw 服务器配置</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchServerConfig}
                    disabled={serverLoading}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${serverLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                {serverConfig === null && !serverLoading ? (
                  <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
                    无法连接到后端服务，请确认服务正在运行。
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* 当前状态展示 */}
                    {serverConfig && (
                      <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1 font-mono">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Provider</span>
                          <span>{serverConfig.provider || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Model</span>
                          <span>{serverConfig.model || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">API Key</span>
                          <span className={serverConfig.hasApiKey ? 'text-green-600 dark:text-green-400' : 'text-destructive'}>
                            {serverConfig.hasApiKey ? serverConfig.apiKeyMasked : '未配置'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Base URL</span>
                          <span className="truncate max-w-[200px]">{serverConfig.baseUrl || '-'}</span>
                        </div>
                      </div>
                    )}

                    {/* 模型 ID 输入 */}
                    <div className="space-y-1.5">
                      <Label className="text-sm">模型 ID</Label>
                      <p className="text-xs text-muted-foreground">格式：provider/model-id（如 minimax-cn/MiniMax-M2.5）</p>
                      <Input
                        value={editModel}
                        onChange={(e) => setEditModel(e.target.value)}
                        placeholder="minimax-cn/MiniMax-M2.5"
                        className="font-mono text-sm"
                      />
                    </div>

                    {/* API Key 输入 */}
                    <div className="space-y-1.5">
                      <Label className="text-sm">API Key</Label>
                      <p className="text-xs text-muted-foreground">留空则保留现有 Key 不变</p>
                      <Input
                        type="password"
                        value={editApiKey}
                        onChange={(e) => setEditApiKey(e.target.value)}
                        placeholder={serverConfig?.hasApiKey ? '输入新 Key 以替换现有配置' : '请输入 API Key'}
                        className="font-mono text-sm"
                        autoComplete="new-password"
                      />
                    </div>

                    {/* 保存状态提示 */}
                    {saveStatus !== 'idle' && saveMessage && (
                      <div className={`flex items-start gap-2 rounded-md p-3 text-xs ${
                        saveStatus === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400' :
                        saveStatus === 'error'   ? 'bg-destructive/10 text-destructive' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {saveStatus === 'success' && <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                        {saveStatus === 'error'   && <AlertCircle   className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                        {saveStatus === 'loading' && <Loader2       className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 animate-spin" />}
                        <span>{saveMessage}</span>
                      </div>
                    )}

                    {/* 保存按钮 */}
                    <Button
                      onClick={handleSaveServerConfig}
                      disabled={saveStatus === 'loading' || !editModel.trim()}
                      className="w-full"
                      size="sm"
                    >
                      {saveStatus === 'loading'
                        ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />保存中...</>
                        : <><Save className="mr-2 h-3.5 w-3.5" />保存并重启 OpenClaw</>
                      }
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Proxy & Security */}
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

        {/* Tab 4: Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.notifications.title')}</CardTitle>
              <CardDescription>{t('settings.notifications.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium text-sm mb-4">{t('settings.notifications.channels')}</h3>
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
                <h3 className="font-medium text-sm mb-4">{t('settings.notifications.security')}</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium text-sm">{t('settings.notifications.audit')}</p>
                      <p className="text-xs text-muted-foreground">{t('settings.notifications.auditDesc')}</p>
                    </div>
                    <Switch
                      checked={auditLogging}
                      onCheckedChange={(v) => updateNotifications({auditLogging: v})}
                    />
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
            <CardFooter>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4"/>
                {t('settings.notifications.export')}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
