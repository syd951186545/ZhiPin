import React, {createContext, useCallback, useContext, useEffect, useState} from 'react'
import {useAuth} from './AuthContext'
import {openclawService} from '@/services/openclawService'
import {useSettingsStore} from '@/stores/useSettingsStore'
import type {ServiceState} from '@/types/openclaw'

// ============================================================
// OpenClaw Context — wraps OpenClawService (HTTP+SSE) for React
// ============================================================

interface OpenClawContextType {
  /** 服务是否就绪（已配置地址和 token） */
  isReady: boolean
  /** 详细服务状态 */
  serviceState: ServiceState
  /** 启动任务（SSE 流式） */
  startTask: (prompt: string, sessionId: string, taskId: string) => Promise<void>
  /** 取消任务 */
  cancelTask: (taskId: string) => void
  /** 测试连接 */
  testConnection: () => Promise<{ latency: number; status: string }>
  /** 订阅事件 */
  onEvent: (action: string, callback: (payload: Record<string, unknown>) => void) => () => void
  /** 最近收到的消息（用于调试） */
  lastMessage: Record<string, unknown> | null
  /** OpenClaw 服务实例 */
  service: typeof openclawService
}

const OpenClawContext = createContext<OpenClawContextType | undefined>(undefined)

export const OpenClawProvider: React.FC<{ children: React.ReactNode }> = ({children}) => {
  const {isAuthenticated} = useAuth()
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl)
  const authToken = useSettingsStore((s) => s.authToken)
  const agentId = useSettingsStore((s) => s.agentId)

  const [serviceState, setServiceState] = useState<ServiceState>('idle')
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null)

  // 监听服务状态变化
  useEffect(() => {
    return openclawService.onStateChange((state) => {
      setServiceState(state)
    })
  }, [])

  // 监听所有事件（调试用）
  useEffect(() => {
    return openclawService.on('*', (payload) => {
      setLastMessage(payload)
    })
  }, [])

  // 当配置变化时重新配置服务
  useEffect(() => {
    if (isAuthenticated && gatewayUrl) {
      openclawService.configure(gatewayUrl, authToken, agentId)
    }
  }, [isAuthenticated, gatewayUrl, authToken, agentId])

  const startTask = useCallback(
    async (prompt: string, sessionId: string, taskId: string) => {
      return openclawService.startTask({prompt, sessionId, taskId})
    },
    []
  )

  const cancelTask = useCallback((taskId: string) => {
    openclawService.cancelTask(taskId)
  }, [])

  const testConnection = useCallback(async () => {
    return openclawService.testConnection()
  }, [])

  const onEvent = useCallback(
    (action: string, callback: (payload: Record<string, unknown>) => void) => {
      return openclawService.on(action, callback)
    },
    []
  )

  return (
    <OpenClawContext.Provider
      value={{
        isReady: serviceState === 'ready',
        serviceState,
        startTask,
        cancelTask,
        testConnection,
        onEvent,
        lastMessage,
        service: openclawService,
      }}
    >
      {children}
    </OpenClawContext.Provider>
  )
}

export const useOpenClaw = () => {
  const context = useContext(OpenClawContext)
  if (context === undefined) throw new Error('useOpenClaw must be used within an OpenClawProvider')
  return context
}
