import React, { useState } from 'react';
import { Wifi, WifiOff, Upload, TestTube, CheckCircle2, Shield, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { useI18n } from '@/contexts/I18nContext';
import { useWebSocket } from '@/contexts/WebSocketContext';

export default function Settings() {
  const { t } = useI18n();
  const { isConnected, reconnect } = useWebSocket();

  // Connection tab
  const [gatewayUrl, setGatewayUrl] = useState('ws://localhost:18789');
  const [authToken, setAuthToken] = useState('');
  const [proxyMode, setProxyMode] = useState(false);
  const [connectionTesting, setConnectionTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Account profiles
  const mockProfiles = [
    { id: '1', name: 'hr@company.com', platform: 'BOSS直聘', status: 'active' },
    { id: '2', name: 'recruit@company.com', platform: '58同城', status: 'needsLogin' },
  ];

  // Platform configs
  const [boss58Name, setBoss58Name] = useState('');
  const [bossName, setBossName] = useState('');

  // Proxy & security
  const [proxyList, setProxyList] = useState('');
  const [delayEnabled, setDelayEnabled] = useState(true);
  const [mouseSimulation, setMouseSimulation] = useState(true);
  const [headless, setHeadless] = useState(false);

  // AI settings
  const [aiModel, setAiModel] = useState('MiniMax-abab6.5-chat');
  const [temperature, setTemperature] = useState([0.7]);
  const [systemPrompt, setSystemPrompt] = useState('');

  // Notifications
  const [wecomUrl, setWecomUrl] = useState('');
  const [notifEmail, setNotifEmail] = useState('');
  const [auditLogging, setAuditLogging] = useState(true);
  const [retentionDays, setRetentionDays] = useState([90]);

  const handleTestConnection = async () => {
    setConnectionTesting(true);
    setConnectionStatus('idle');
    await new Promise((r) => setTimeout(r, 1500));
    setConnectionStatus('success');
    setConnectionTesting(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} description={t('settings.desc')} />

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
              <CardTitle>{t('settings.tab.connection')}</CardTitle>
              <CardDescription>{t('settings.connection.gatewayDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t('settings.connection.gateway')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.connection.gatewayDesc')}</p>
                <Input value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.connection.token')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.connection.tokenDesc')}</p>
                <Input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder="sk-..." />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-sm">{t('settings.connection.proxyMode')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.connection.proxyModeDesc')}</p>
                </div>
                <Switch checked={proxyMode} onCheckedChange={setProxyMode} />
              </div>
              {connectionStatus === 'success' && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('settings.connection.connected')}
                </div>
              )}
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline" onClick={handleTestConnection} disabled={connectionTesting}>
                {connectionTesting ? t('settings.connection.testing') : t('settings.connection.test')}
              </Button>
              <Button>{t('settings.connection.save')}</Button>
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
                <Button size="sm">{t('settings.profiles.new')}</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">{t('settings.profiles.table.name')}</th>
                      <th className="text-left p-3 font-medium">{t('settings.profiles.table.platform')}</th>
                      <th className="text-center p-3 font-medium">{t('settings.profiles.table.status')}</th>
                      <th className="text-right p-3 font-medium">{t('settings.profiles.table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockProfiles.map((profile) => (
                      <tr key={profile.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{profile.name}</td>
                        <td className="p-3">{profile.platform}</td>
                        <td className="p-3 text-center">
                          <Badge variant={profile.status === 'active' ? 'default' : 'destructive'}>
                            {profile.status === 'active' ? t('settings.profiles.status.active') : t('settings.profiles.status.needsLogin')}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm">
                              <Upload className="h-4 w-4 mr-1" />
                              {t('settings.profiles.action.upload')}
                            </Button>
                            <Button variant="ghost" size="sm">
                              <TestTube className="h-4 w-4 mr-1" />
                              {t('settings.profiles.action.test')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Platform Configs */}
        <TabsContent value="platforms">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.platforms.58.title')}</CardTitle>
                <CardDescription>{t('settings.platforms.desc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('settings.platforms.nickname')}</Label>
                  <Input value={boss58Name} onChange={(e) => setBoss58Name(e.target.value)} placeholder="我的企业名称" />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.platforms.boundProfile')}</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="选择账号" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="p2">recruit@company.com</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.platforms.customUrl')}</Label>
                  <Input placeholder="https://www.58.com/..." />
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button variant="outline">{t('settings.platforms.verify')}</Button>
                <Button>{t('settings.platforms.save')}</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('settings.platforms.boss.title')}</CardTitle>
                <CardDescription>{t('settings.platforms.desc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('settings.platforms.nickname')}</Label>
                  <Input value={bossName} onChange={(e) => setBossName(e.target.value)} placeholder="我的企业名称" />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.platforms.boundProfile')}</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="选择账号" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="p1">hr@company.com</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.platforms.customUrl')}</Label>
                  <Input placeholder="https://www.zhipin.com/..." />
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button variant="outline">{t('settings.platforms.verify')}</Button>
                <Button>{t('settings.platforms.save')}</Button>
              </CardFooter>
            </Card>
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
                  onChange={(e) => setProxyList(e.target.value)}
                  placeholder="socks5://127.0.0.1:1080&#10;http://proxy.example.com:8080"
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
                  <Switch checked={delayEnabled} onCheckedChange={setDelayEnabled} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium text-sm">{t('settings.proxy.mouse')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.proxy.mouseDesc')}</p>
                  </div>
                  <Switch checked={mouseSimulation} onCheckedChange={setMouseSimulation} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium text-sm">{t('settings.proxy.headless')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.proxy.headlessDesc')}</p>
                  </div>
                  <Switch checked={headless} onCheckedChange={setHeadless} />
                </div>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline">{t('settings.proxy.test')}</Button>
              <Button>{t('settings.proxy.save')}</Button>
            </CardFooter>
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
                <Select value={aiModel} onValueChange={setAiModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MiniMax-abab6.5-chat">MiniMax-abab6.5-chat</SelectItem>
                    <SelectItem value="MiniMax-abab5.5-chat">MiniMax-abab5.5-chat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('settings.ai.temperature')}</Label>
                    <p className="text-xs text-muted-foreground">{t('settings.ai.temperatureDesc')}</p>
                  </div>
                  <span className="text-sm font-mono font-medium">{temperature[0].toFixed(1)}</span>
                </div>
                <Slider
                  value={temperature}
                  onValueChange={setTemperature}
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
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="例如：请优先推荐有大型项目经验的候选人，重点关注技术能力和团队协作经验..."
                  rows={4}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button>{t('settings.ai.save')}</Button>
            </CardFooter>
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
                      onChange={(e) => setWecomUrl(e.target.value)}
                      placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('settings.notifications.email')}</Label>
                    <p className="text-xs text-muted-foreground">{t('settings.notifications.emailDesc')}</p>
                    <Input
                      type="email"
                      value={notifEmail}
                      onChange={(e) => setNotifEmail(e.target.value)}
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
                    <Switch checked={auditLogging} onCheckedChange={setAuditLogging} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>{t('settings.notifications.retention')}</Label>
                        <p className="text-xs text-muted-foreground">{t('settings.notifications.retentionDesc')}</p>
                      </div>
                      <span className="text-sm font-mono font-medium">{retentionDays[0]} 天</span>
                    </div>
                    <Slider
                      value={retentionDays}
                      onValueChange={setRetentionDays}
                      min={7}
                      max={365}
                      step={1}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                {t('settings.notifications.export')}
              </Button>
              <Button>{t('settings.notifications.save')}</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
