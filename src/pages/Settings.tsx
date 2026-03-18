import React from 'react'
import {
  Download,
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

export default function Settings() {
  const {t} = useI18n()

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
