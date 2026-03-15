import {createClient} from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Bypass Web Locks API to prevent 5s lock contention in React StrictMode.
    // StrictMode double-mounts effects; the second onAuthStateChange subscription
    // would block waiting for the first's lock before forceful recovery.
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => fn(),
  },
})
