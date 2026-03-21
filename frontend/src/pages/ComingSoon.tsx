import React from 'react'
import {useSearchParams} from 'react-router-dom'
import {Bot, Sparkles} from 'lucide-react'
import {Badge} from '@/components/ui/badge'

export default function ComingSoon() {
  const [params] = useSearchParams()
  const name = params.get('name') || '数字员工'

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
          <Bot className="w-12 h-12 text-primary/60" />
        </div>
        <div className="absolute -top-2 -right-2">
          <Sparkles className="w-6 h-6 text-yellow-400 animate-pulse" />
        </div>
      </div>

      <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs font-medium tracking-wide">
        即将推出
      </Badge>

      <h1 className="text-2xl font-bold tracking-tight mb-3">{name}</h1>
      <p className="text-muted-foreground max-w-sm leading-relaxed">
        该功能正在紧张开发中，敬请期待。
        <br />
        机灵数字员工矩阵即将为您的业务提供全方位AI自动化支持。
      </p>
    </div>
  )
}
