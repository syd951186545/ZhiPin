import React, {createContext, useCallback, useContext, useEffect, useState} from 'react'
import {useAuth} from './AuthContext'
import {openclawService} from '@/services/openclawService'
import {useSettingsStore} from '@/stores/useSettingsStore'
import type {ConnectionState, OpenClawResponse} from '@/types/openclaw'

// ============================================================
// WebSocket Context — wraps OpenClawService for React
// ============================================================

interface WebSocketContextType {
  /** 是否已连接 */
  isConnected: boolean
  /** 详细连接状态 */
  connectionState: ConnectionState
  /** 发送请求并等待响应 */
  sendMessage: (action: string, payload: Record<string, unknown>) => Promise<OpenClawResponse>
  /** 发送命令，不等待响应 */
  sendCommand: (action: string, payload: Record<string, unknown>) => void
  /** 最近收到的消息（用于 terminal 显示） */
  lastMessage: Record<string, unknown> | null
  /** 手动重连 */
  reconnect: () => void
  /** 测试连接 */
  testConnection: () => Promise<{ latency: number; version: string; status: string }>
  /** 订阅事件 */
  onEvent: (action: string, callback: (payload: Record<string, unknown>) => void) => () => void
  /** OpenClaw 服务实例 */
  service: typeof openclawService
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth()
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl)
  const authToken = useSettingsStore((s) => s.authToken)

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null)

  // Track connection state changes from service
  useEffect(() => {
    const unsub = openclawService.onStateChange((state) => {
      setConnectionState(state)
    })
    return unsub
  }, [])

  // Track all messages for terminal/debug
  useEffect(() => {
    const unsub = openclawService.on('*', (payload) => {
      setLastMessage(payload)
    })
    return unsub
  }, [])

  // Connect when authenticated, disconnect when not
  useEffect(() => {
    if (isAuthenticated && gatewayUrl) {
      openclawService.connect(gatewayUrl, authToken).catch((err) => {
        console.warn('[OpenClaw] 初始连接失败:', err.message)
      })
    } else {
      openclawService.disconnect()
    }

    return () => {
      openclawService.disconnect()
    }
  }, [isAuthenticated, gatewayUrl, authToken])

  const sendMessage = useCallback(
    async (action: string, payload: Record<string, unknown>): Promise<OpenClawResponse> => {
      return openclawService.sendRequest(action as any, payload)
    },
    []
  )

  const sendCommand = useCallback(
    (action: string, payload: Record<string, unknown>) => {
      openclawService.sendCommand(action as any, payload)
    },
    []
  )

  const reconnect = useCallback(() => {
    openclawService.disconnect()
    if (gatewayUrl) {
      openclawService.connect(gatewayUrl, authToken).catch((err) => {
        console.warn('[OpenClaw] 重连失败:', err.message)
      })
    }
  }, [gatewayUrl, authToken])

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
    <WebSocketContext.Provider
      value={{
        isConnected: connectionState === 'connected',
        connectionState,
        sendMessage,
        sendCommand,
        lastMessage,
        reconnect,
        testConnection,
        onEvent,
        service: openclawService,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (context === undefined) throw new Error('useWebSocket must be used within a WebSocketProvider')
  return context
}
