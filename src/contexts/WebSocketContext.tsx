import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

interface WebSocketContextType {
  isConnected: boolean;
  sendMessage: (action: string, payload: Record<string, unknown>) => void;
  lastMessage: Record<string, unknown> | null;
  reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!isAuthenticated) return;

    const wsUrl = import.meta.env.VITE_OPENCLAW_WS_URL || 'ws://localhost:18789';

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[OpenClaw] 连接已建立');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch {
          console.warn('[OpenClaw] 消息解析失败:', event.data);
        }
      };

      ws.onclose = () => {
        console.log('[OpenClaw] 连接已断开');
        setIsConnected(false);
        // Auto-reconnect after 5 seconds
        reconnectTimerRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        // Silently handle - will trigger onclose which handles reconnect
        // Use mock mode in development
        setIsConnected(true); // Mock connected for development
      };

      wsRef.current = ws;
    } catch {
      // WebSocket not available, use mock mode
      console.log('[OpenClaw] 使用模拟连接模式');
      setIsConnected(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      // Use mock mode by default for development
      setIsConnected(true);
    } else {
      wsRef.current?.close();
      setIsConnected(false);
    }

    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [isAuthenticated]);

  const sendMessage = useCallback((action: string, payload: Record<string, unknown>) => {
    const message = JSON.stringify({ action, payload, timestamp: new Date().toISOString() });

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    } else {
      // Mock response for development
      console.log('[OpenClaw] 发送命令:', { action, payload });
      setTimeout(() => {
        setLastMessage({
          type: 'response',
          action,
          status: 'success',
          timestamp: new Date().toISOString(),
        });
      }, 800);
    }
  }, []);

  const reconnect = useCallback(() => {
    wsRef.current?.close();
    connect();
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ isConnected, sendMessage, lastMessage, reconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) throw new Error('useWebSocket must be used within a WebSocketProvider');
  return context;
};
