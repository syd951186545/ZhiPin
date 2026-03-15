import {useEffect} from 'react'
import {useWebSocket} from '@/contexts/WebSocketContext'

/**
 * Hook for subscribing to OpenClaw events.
 * Automatically unsubscribes when component unmounts.
 *
 * @param action - The event action to listen for (e.g., 'task.progress')
 * @param callback - Handler function called with the event payload
 * @param enabled - Optional flag to conditionally enable/disable the subscription
 */
export function useOpenClawEvent(
  action: string,
  callback: (payload: Record<string, unknown>) => void,
  enabled = true
) {
  const { onEvent } = useWebSocket()

  useEffect(() => {
    if (!enabled) return
    const unsub = onEvent(action, callback)
    return unsub
  }, [action, callback, enabled, onEvent])
}

/**
 * Hook for subscribing to multiple OpenClaw events at once.
 */
export function useOpenClawEvents(
  handlers: Record<string, (payload: Record<string, unknown>) => void>,
  enabled = true
) {
  const { onEvent } = useWebSocket()

  useEffect(() => {
    if (!enabled) return
    const unsubs = Object.entries(handlers).map(([action, callback]) =>
      onEvent(action, callback)
    )
    return () => unsubs.forEach((unsub) => unsub())
  }, [handlers, enabled, onEvent])
}
