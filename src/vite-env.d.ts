/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_MINIMAX_API_KEY: string
  readonly VITE_OPENCLAW_WS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
