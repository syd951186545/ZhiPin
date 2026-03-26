alter table public.tenant_settings
  add column if not exists ai_api_key text,
  add column if not exists ai_validation_status text not null default 'unknown',
  add column if not exists ai_validation_message text,
  add column if not exists ai_validated_at timestamptz;
