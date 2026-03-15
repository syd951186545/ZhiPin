import React, {useState} from 'react'
import {
  CheckCircle2, Download, Loader2,
  Wifi, WifiOff, XCircle,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Switch} from '@/components/ui/switch'
import {Slider} from '@/components/ui/slider'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import PageHeader from '@/components/shared/PageHeader'
import {useI18n} from '@/contexts/I18nContext'
import {useOpenClaw} from '@/contexts/OpenClawContext'
import {useSettingsStore} from '@/stores/useSettingsStore'

export default function Settings() {
  const {t} = useI18n()
  const {isReady, serviceState, testConnection} = useOpenClaw()

  // Settings store (persisted to localStorage)
  const {
    gatewayUrl, authToken, agentId,
    proxyList, delayEnabled, mouseSimulation, headless,
    aiModel, aiTemperature, aiSystemPrompt,
    wecomUrl, notifEmail, auditLogging, retentionDays,
    updateConnection, updateProxy, updateAI, updateNotifications,
  } = useSettingsStore()

  // Local form state for connection editing
  const [formGatewayUrl, setFormGatewayUrl] = useState(gatewayUrl)
  const [formAuthToken, setFormAuthToken] = useState(authToken)
  const [formAgentId, setFormAgentId] = useState(agentId)

  // Connection test
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [connectionResult, setConnectionResult] = useState<{
    status: 'idle' | 'success' | 'error'
    message?: string
    latency?: number
  }>({status: 'idle'})

  // ---- Handlers ----

  const handleSaveConnection = () => {
    updateConnection({
      gatewayUrl: formGatewayUrl,
      authToken: formAuthToken,
      agentId: formAgentId,
    })
  }

  const handleTestConnection = async () => {
    // 先保存再测试
    handleSaveConnection()
    setConnectionTesting(true)
    setConnectionResult({status: 'idle'})

    try {
      // 等待 configure 生效
      await new Promise((r) => setTimeout(r, 300))

      const result = await testConnection()
      setConnectionResult({
        status: 'success',
        message: result.status,
        latency: result.latency,
      })
    } catch (err) {
      setConnectionResult({
        status: 'error',
        message: err instanceof Error ? err.message : t('settings.connection.failed'),
      })
    } finally {
      setConnectionTesting(false)
    }
  }

  const getServiceStateLabel = () => {
    switch (serviceState) {
      case 'ready':
        return (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <Wifi className="h-4 w-4"/>
            <span>{t('status.connected')}</span>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <WifiOff className="h-4 w-4"/>
            <span>连接异常</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-2 text-yellow-600 text-sm">
            <WifiOff className="h-4 w-4"/>
            <span>未配置</span>
          </div>
        )
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} description={t('settings.desc')}/>

      <Tabs defaultValue="connection" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="connection">{t('settings.tab.connection')}</TabsTrigger>
          <TabsTrigger value="ai">{t('settings.tab.ai')}</TabsTrigger>
          <TabsTrigger value="proxy">{t('settings.tab.proxy')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('settings.tab.notifications')}</TabsTrigger>
        </TabsList>

        {/* Tab 1: Connection (moved to first) */}
        <TabsContent value="connection">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>OpenClaw 连接配置</CardTitle>
                  <CardDescription>配置 OpenClaw 网关地址、认证令牌和目标 Agent</CardDescription>
                </div>
                {getServiceStateLabel()}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>网关地址</Label>
                <p className="text-xs text-muted-foreground">OpenClaw 服务的 HTTP 地址（如 http://192.168.3.215:18789）</p>
                <Input value={formGatewayUrl} onChange={(e) => setFormGatewayUrl(e.target.value)}
                       placeholder="http://192.168.3.215:18789"/>
              </div>

              <div className="space-y-2">
                <Label>Auth Token</Label>
                <p className="text-xs text-muted-foreground">OpenClaw 配置文件中设置的认证令牌（gateway.auth.token）</p>
                <Input type="password" value={formAuthToken} onChange={(e) => setFormAuthToken(e.target.value)}
                       placeholder="输入你的 Auth Token"/>
              </div>

              <div className="space-y-2">
                <Label>Agent ID</Label>
                <p className="text-xs text-muted-foreground">要连接的 OpenClaw Agent 名称（如 hr_juzi）</p>
                <Input value={formAgentId} onChange={(e) => setFormAgentId(e.target.value)}
                       placeholder="hr_juzi"/>
              </div>

              {/* Connection test result */}
              {connectionResult.status === 'success' && (
                <div
                  className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4"/>
                    连接成功
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">延迟：</span>
                      {connectionResult.latency}ms
                    </div>
                    <div>
                      <span className="font-medium">状态：</span>
                      {connectionResult.message}
                    </div>
                  </div>
                </div>
              )}

              {connectionResult.status === 'error' && (
                <div
                  className="flex items-center gap-2 text-red-600 text-sm rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4">
                  <XCircle className="h-4 w-4"/>
                  连接失败: {connectionResult.message}
                </div>
              )}
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline" onClick={handleTestConnection} disabled={connectionTesting}>
                {connectionTesting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>测试中...</>
                ) : (
                  '测试连接'
                )}
              </Button>
              <Button onClick={handleSaveConnection}>
                保存配置
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Tab 2: AI Settings */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.ai.title')}</CardTitle>
              <CardDescription>{t('settings.ai.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
