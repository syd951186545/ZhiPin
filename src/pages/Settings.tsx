import React, {useState} from 'react'
import {
  CheckCircle2, Download, LogIn, Loader2, ShieldCheck, Trash2,
  Wifi, WifiOff, XCircle,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Switch} from '@/components/ui/switch'
import {Slider} from '@/components/ui/slider'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import PageHeader from '@/components/shared/PageHeader'
import AddProfileDialog from '@/components/settings/AddProfileDialog'
import PlatformLoginDialog from '@/components/settings/PlatformLoginDialog'
import {useI18n} from '@/contexts/I18nContext'
import {useWebSocket} from '@/contexts/WebSocketContext'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {openclawService} from '@/services/openclawService'
import {PLATFORMS} from '@/lib/constants'

export default function Settings() {
  const {t} = useI18n()
  const {isConnected, connectionState, reconnect, testConnection} = useWebSocket()

  // Settings store (persisted to localStorage)
  const {
    gatewayUrl, authToken, proxyMode,
    platformProfiles, platformConfigs,
    proxyList, delayEnabled, mouseSimulation, headless,
    aiModel, aiTemperature, aiSystemPrompt,
    wecomUrl, notifEmail, auditLogging, retentionDays,
    updateConnection, updateProxy, updateAI, updateNotifications,
    updatePlatformConfig, updateProfile, removeProfile,
  } = useSettingsStore()

  // Local form state for connection editing
  const [formGatewayUrl, setFormGatewayUrl] = useState(gatewayUrl)
  const [formAuthToken, setFormAuthToken] = useState(authToken)
  const [formProxyMode, setFormProxyMode] = useState(proxyMode)

  // Connection test
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [connectionResult, setConnectionResult] = useState<{
    status: 'idle' | 'success' | 'error'
    message?: string
    latency?: number
    version?: string
  }>({status: 'idle'})

  // Profile dialogs
  const [addProfileOpen, setAddProfileOpen] = useState(false)
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [loginProfileId, setLoginProfileId] = useState<string | null>(null)
  const [verifyingProfileId, setVerifyingProfileId] = useState<string | null>(null)

  // ---- Handlers ----

  const handleTestConnection = async () => {
    setConnectionTesting(true)
    setConnectionResult({status: 'idle'})

    try {
      // Save connection settings first so the service uses the new URL
      updateConnection({
        gatewayUrl: formGatewayUrl,
        authToken: formAuthToken,
        proxyMode: formProxyMode,
      })

      // Wait briefly for reconnection
      await new Promise((r) => setTimeout(r, 1000))

      const result = await testConnection()
      setConnectionResult({
        status: 'success',
        message: result.status,
        latency: result.latency,
        version: result.version,
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

  const handleSaveConnection = () => {
    updateConnection({
      gatewayUrl: formGatewayUrl,
      authToken: formAuthToken,
      proxyMode: formProxyMode,
    })
    reconnect()
  }

  const handleLoginProfile = (profileId: string) => {
    setLoginProfileId(profileId)
    setLoginDialogOpen(true)
  }

  const handleVerifyProfile = async (profileId: string) => {
    const profile = platformProfiles.find((p) => p.id === profileId)
    if (!profile?.cookies) return

    setVerifyingProfileId(profileId)
    updateProfile(profileId, {status: 'verifying'})

    try {
      const result = await openclawService.verifyPlatformSession(
        profile.platform,
        profile.cookies,
      )
      updateProfile(profileId, {
        status: result.valid ? 'active' : 'expired',
        lastVerified: new Date().toISOString(),
      })
    } catch {
      updateProfile(profileId, {status: 'expired'})
    } finally {
      setVerifyingProfileId(null)
    }
  }

  const handleDeleteProfile = (profileId: string) => {
    removeProfile(profileId)
  }

  const getProfileStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">{t('settings.profiles.status.active')}</Badge>
      case 'verifying':
        return <Badge variant="secondary">{t('settings.profiles.status.verifying')}</Badge>
      case 'expired':
        return <Badge variant="destructive">{t('settings.profiles.status.expired')}</Badge>
      default:
        return <Badge variant="destructive">{t('settings.profiles.status.needsLogin')}</Badge>
    }
  }

  const getConnectionStateLabel = () => {
    switch (connectionState) {
      case 'connected':
        return (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <Wifi className="h-4 w-4"/>
            <span>{t('status.connected')}</span>
          </div>
        )
      case 'connecting':
        return (
          <div className="flex items-center gap-2 text-blue-600 text-sm">
            <Loader2 className="h-4 w-4 animate-spin"/>
            <span>{t('status.connecting')}</span>
          </div>
        )
      case 'reconnecting':
        return (
          <div className="flex items-center gap-2 text-yellow-600 text-sm">
            <Loader2 className="h-4 w-4 animate-spin"/>
            <span>{t('status.reconnecting')}</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <WifiOff className="h-4 w-4"/>
            <span>{t('status.disconnected')}</span>
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
          <TabsTrigger value="profiles">{t('settings.tab.profiles')}</TabsTrigger>
          <TabsTrigger value="platforms">{t('settings.tab.platforms')}</TabsTrigger>
          <TabsTrigger value="proxy">{t('settings.tab.proxy')}</TabsTrigger>
          <TabsTrigger value="ai">{t('settings.tab.ai')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('settings.tab.notifications')}</TabsTrigger>
        </TabsList>

        {/* Tab 1: Connection */}
        <TabsContent value="connection">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('settings.tab.connection')}</CardTitle>
                  <CardDescription>{t('settings.connection.gatewayDesc')}</CardDescription>
                </div>
                {getConnectionStateLabel()}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t('settings.connection.gateway')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.connection.gatewayDesc')}</p>
                <Input value={formGatewayUrl} onChange={(e) => setFormGatewayUrl(e.target.value)}/>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.connection.token')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.connection.tokenDesc')}</p>
                <Input
                  type="password"
                  value={formAuthToken}
                  onChange={(e) => setFormAuthToken(e.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-sm">{t('settings.connection.proxyMode')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.connection.proxyModeDesc')}</p>
                </div>
                <Switch checked={formProxyMode} onCheckedChange={setFormProxyMode}/>
              </div>

              {/* Connection test result */}
              {connectionResult.status === 'success' && (
                <div
                  className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4"/>
                    {t('settings.connection.connected')}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">{t('settings.connection.latency')}：</span>
                      {connectionResult.latency}ms
                    </div>
                    <div>
                      <span className="font-medium">{t('settings.connection.version')}：</span>
                      {connectionResult.version}
                    </div>
                    <div>
                      <span className="font-medium">{t('settings.connection.status')}：</span>
                      {connectionResult.message}
                    </div>
                  </div>
                </div>
              )}

              {connectionResult.status === 'error' && (
                <div
                  className="flex items-center gap-2 text-red-600 text-sm rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4">
                  <XCircle className="h-4 w-4"/>
                  {t('settings.connection.failed')}: {connectionResult.message}
                </div>
              )}
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline" onClick={handleTestConnection} disabled={connectionTesting}>
                {connectionTesting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>{t('settings.connection.testing')}</>
                ) : (
                  t('settings.connection.test')
                )}
              </Button>
              <Button onClick={handleSaveConnection}>
                {t('settings.connection.save')}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Tab 2: Account Profiles */}
        <TabsContent value="profiles">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('settings.profiles.title')}</CardTitle>
                  <CardDescription>{t('settings.profiles.desc')}</CardDescription>
                </div>
                <Button size="sm" onClick={() => setAddProfileOpen(true)}>
                  {t('settings.profiles.new')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {platformProfiles.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p>暂无平台账号，请点击"添加账号"开始配置</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">{t('settings.profiles.table.name')}</th>
                      <th className="text-left p-3 font-medium">{t('settings.profiles.table.platform')}</th>
                      <th className="text-center p-3 font-medium">{t('settings.profiles.table.status')}</th>
                      <th className="text-center p-3 font-medium">{t('settings.profiles.lastVerified')}</th>
                      <th className="text-right p-3 font-medium">{t('settings.profiles.table.actions')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {platformProfiles.map((profile) => (
                      <tr key={profile.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">
                          {profile.name}
                          {profile.accountName && (
                            <span className="text-xs text-muted-foreground ml-2">({profile.accountName})</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">
                            {PLATFORMS[profile.platform as keyof typeof PLATFORMS]?.name || profile.platform}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          {getProfileStatusBadge(profile.status)}
                        </td>
                        <td className="p-3 text-center text-xs text-muted-foreground">
                          {profile.lastVerified
                            ? new Date(profile.lastVerified).toLocaleString('zh-CN')
                            : t('settings.profiles.neverVerified')}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleLoginProfile(profile.id)}
                              disabled={!isConnected}
                            >
                              <LogIn className="h-4 w-4 mr-1"/>
                              {t('settings.profiles.action.login')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleVerifyProfile(profile.id)}
                              disabled={!isConnected || verifyingProfileId === profile.id || !profile.cookies}
                            >
                              {verifyingProfileId === profile.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin"/>
                              ) : (
                                <ShieldCheck className="h-4 w-4 mr-1"/>
                              )}
                              {t('settings.profiles.action.verify')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteProfile(profile.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4"/>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dialogs */}
          <AddProfileDialog open={addProfileOpen} onOpenChange={setAddProfileOpen}/>
          <PlatformLoginDialog
            open={loginDialogOpen}
            onOpenChange={setLoginDialogOpen}
            profileId={loginProfileId}
          />
        </TabsContent>

        {/* Tab 3: Platform Configs */}
        <TabsContent value="platforms">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(PLATFORMS).map(([key, {name: pName}]) => {
              const config = platformConfigs[key] || {nickname: '', boundProfileId: '', customUrl: ''}
              const profilesForPlatform = platformProfiles.filter((p) => p.platform === key)

              return (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle>{pName}</CardTitle>
                    <CardDescription>{t('settings.platforms.desc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t('settings.platforms.nickname')}</Label>
                      <Input
                        value={config.nickname}
                        onChange={(e) => updatePlatformConfig(key, {nickname: e.target.value})}
                        placeholder="我的企业名称"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('settings.platforms.boundProfile')}</Label>
                      <Select
                        value={config.boundProfileId}
                        onValueChange={(v) => updatePlatformConfig(key, {boundProfileId: v})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择账号"/>
                        </SelectTrigger>
                        <SelectContent>
                          {profilesForPlatform.length === 0 ? (
                            <SelectItem value="_none" disabled>暂无账号，请先添加</SelectItem>
                          ) : (
                            profilesForPlatform.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} {p.status === 'active' ? '✓' : ''}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('settings.platforms.customUrl')}</Label>
                      <Input
                        value={config.customUrl}
                        onChange={(e) => updatePlatformConfig(key, {customUrl: e.target.value})}
                        placeholder={`https://www.${key === 'boss_zhipin' ? 'zhipin.com' : key === '58' ? '58.com' : 'linkedin.com'}/...`}
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={() => updatePlatformConfig(key, config)}>
                      {t('settings.platforms.save')}
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* Tab 4: Proxy & Security */}
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

        {/* Tab 5: AI Settings */}
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

        {/* Tab 6: Notifications */}
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
