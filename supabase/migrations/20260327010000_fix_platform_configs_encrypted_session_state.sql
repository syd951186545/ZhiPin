-- Backfill fix for environments that already applied the mistaken migration to platform_accounts.
-- Runtime code persists login state on public.platform_configs.

ALTER TABLE public.platform_configs
  ADD COLUMN IF NOT EXISTS encrypted_session_state text;

COMMENT ON COLUMN public.platform_configs.encrypted_session_state
  IS 'AES-256-GCM encrypted Playwright storageState, base64-encoded. Written by live_login confirm flow.';
