import React, {useState} from 'react'
import {
  Download, Save, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Switch} from '@/components/ui/switch'
import {Slider} from '@/components/ui/slider'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import PageHeader from '@/components/shared/PageHeader'
import {useI18n} from '@/contexts/I18nContext'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {Input} from '@/components/ui/input'
import {useTenantSettings} from '@/hooks/useTenantSettings'

export default function Settings() {
  const {t} = useI18n()

  // Settings store (persisted to localStorage)
  const {
    proxyList, delayEnabled, mouseSimulation, headless,
    aiModel, aiTemperature, aiSystemPrompt,
    wecomUrl, notifEmail, auditLogging, retentionDays,
    updateProxy, updateAI, updateNotifications,
  } = useSettingsStore()

  // Supabase tenant settings (notifications only; company profile is managed in 企业管理)
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

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} description={t('settings.desc')}/>

      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="ai">{t('settings.tab.ai')}</TabsTrigger>
          <TabsTrigger value="proxy">{t('settings.tab.proxy')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('settings.tab.notifications')}</TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Settings */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.ai.title')}</CardTitle>
              <CardDescription>{t('settings.ai.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t('settings.ai.model')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.ai.modelDesc')}。前端仅保存业务偏好，不直接配置 OpenClaw 服务。</p>
                <Input
                  value={aiModel}
                  onChange={(e) => updateAI({aiModel: e.target.value})}
                  placeholder="例如：minimax-cn/MiniMax-M2.5"
                  className="font-mono text-sm"
                />
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
      </Tabs>
    </div>
  )
}
