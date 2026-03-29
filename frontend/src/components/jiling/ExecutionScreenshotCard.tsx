import React, {useEffect, useState} from 'react'
import {Camera, Search} from 'lucide-react'
import type {ActionNode} from '@/stores/useWorkflowStore'

export function getActionNodeImageUrls(node: ActionNode): string[] {
  const deduped = new Set<string>()
  for (const candidate of [...(node.imageUrls || []), node.contentUrl, node.screenshot]) {
    if (typeof candidate !== 'string') continue
    const normalized = candidate.trim()
    if (!normalized) continue
    deduped.add(normalized)
  }
  return Array.from(deduped)
}

interface Props {
  node: ActionNode
  onPreview: (src: string) => void
}

export function ExecutionScreenshotCard({node, onPreview}: Props) {
  const imageUrls = getActionNodeImageUrls(node)
  const imageUrlKey = imageUrls.join('|')
  const [activeIndex, setActiveIndex] = useState(imageUrls.length > 0 ? 0 : -1)

  useEffect(() => {
    setActiveIndex(imageUrls.length > 0 ? 0 : -1)
  }, [node.id, imageUrlKey])

  const activeUrl = activeIndex >= 0 ? imageUrls[activeIndex] : null
  const fallbackUrl = imageUrls[0] || null
  const allAttemptsFailed = !activeUrl && imageUrls.length > 0

  return (
    <div className="overflow-hidden rounded-lg border shadow-sm">
      <div className="relative">
        {activeUrl ? (
          <button
            type="button"
            className="group/shot relative block w-full text-left"
            onClick={() => onPreview(activeUrl)}
          >
            <img
              src={activeUrl}
              alt={node.action}
              className="h-28 w-full object-cover object-top"
              onError={() => setActiveIndex((current) => (current + 1 < imageUrls.length ? current + 1 : -1))}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/shot:bg-black/10">
              <Search className="h-5 w-5 text-white opacity-0 transition-opacity group-hover/shot:opacity-80"/>
            </div>
          </button>
        ) : (
          <div className="flex h-28 flex-col items-center justify-center gap-1 bg-muted/20 px-4 text-center text-muted-foreground">
            <Camera className="h-7 w-7 opacity-30"/>
            <p className="text-xs">截图加载失败</p>
            <p className="text-[11px] opacity-80">已尝试备用链接，可直接打开原图重试。</p>
          </div>
        )}
        {node.artifactId && (
          <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {node.persisted ? '已落库' : '实时'}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/10 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{node.action}</p>
          <p className="text-[11px] text-muted-foreground">{node.time}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeUrl && (
            <button
              type="button"
              className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
              onClick={() => onPreview(activeUrl)}
            >
              查看
            </button>
          )}
          {fallbackUrl && (
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-medium text-muted-foreground transition-opacity hover:text-foreground"
            >
              原图
            </a>
          )}
        </div>
      </div>

      {allAttemptsFailed && (
        <div className="border-t bg-amber-50/80 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
          当前卡片内预览未成功加载，但工作流截图已生成。可点击"原图"直接打开，或刷新页面后重试。
        </div>
      )}
    </div>
  )
}
