import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface UseRealtimeOptions {
  event?: PostgresChangeEvent
  schema?: string
}

export function useRealtimeSubscription<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  filter: string | undefined,
  callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  options?: UseRealtimeOptions
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const callbackRef = useRef(callback)

  // Keep callback ref current to avoid re-subscribing on callback change
  callbackRef.current = callback

  useEffect(() => {
    const event = options?.event || '*'
    const schema = options?.schema || 'public'

    const channelName = `realtime_${table}_${filter || 'all'}_${Date.now()}`

    const channelConfig: {
      event: PostgresChangeEvent
      schema: string
      table: string
      filter?: string
    } = {
      event,
      schema,
      table,
    }

    if (filter) {
      channelConfig.filter = filter
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as never,
        channelConfig,
        (payload: RealtimePostgresChangesPayload<T>) => {
          callbackRef.current(payload)
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn(`[Realtime] Subscription error on table "${table}"`)
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [table, filter, options?.event, options?.schema])
}
