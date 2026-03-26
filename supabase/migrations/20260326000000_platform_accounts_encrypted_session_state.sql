-- Add encrypted_session_state column to platform_accounts table
-- Stores AES-256-GCM encrypted Playwright storageState (base64 encoded)
-- for noVNC live login session persistence

ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS encrypted_session_state text;

COMMENT ON COLUMN platform_accounts.encrypted_session_state
  IS 'AES-256-GCM encrypted Playwright storageState, base64-encoded. Written by live_login confirm flow.';
