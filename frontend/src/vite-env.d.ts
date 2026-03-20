/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_MINIMAX_API_KEY: string
  readonly VITE_OPENCLAW_URL: string
  readonly VITE_OPENCLAW_WS_URL: string
  readonly VITE_DEFAULT_LOGIN_EMAIL: string
  readonly VITE_DEFAULT_LOGIN_PASSWORD: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
