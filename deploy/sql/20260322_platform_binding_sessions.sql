-- 平台账号持久登录扩展
-- 需在 Supabase SQL Editor 或迁移工具中执行

alter table public.platform_configs
  add column if not exists platform_url text,
  add column if not exists login_method text check (login_method in ('phone', 'qr', 'password')),
  add column if not exists browser_session_key text,
  add column if not exists login_state text,
  add column if not exists login_identifier_masked text,
  add column if not exists last_error text,
  add column if not exists last_bind_task_id uuid,
  add column if not exists last_unbind_task_id uuid;

create table if not exists public.platform_binding_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.platform_configs(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  action text not null check (action in ('bind', 'verify', 'unbind')),
  status text not null check (status in ('running', 'awaiting_sms', 'awaiting_qr', 'awaiting_password_2fa', 'completed', 'failed', 'expired', 'cancelled')),
  step_key text,
  openclaw_session_key text not null,
  latest_screenshot_url text,
  qr_screenshot_url text,
  awaiting_payload_schema jsonb,
  retry_count integer not null default 0,
  error_message text,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_platform_binding_sessions_tenant_created_at
  on public.platform_binding_sessions (tenant_id, created_at desc);

create index if not exists idx_platform_binding_sessions_account_created_at
  on public.platform_binding_sessions (account_id, created_at desc);

alter table public.platform_binding_sessions enable row level security;

create policy if not exists "platform_binding_sessions_select_own_tenant"
  on public.platform_binding_sessions
  for select
  using (
    tenant_id in (
      select p.tenant_id from public.profiles p where p.id = auth.uid()
    )
  );

create policy if not exists "platform_binding_sessions_insert_own_tenant"
  on public.platform_binding_sessions
  for insert
  with check (
    tenant_id in (
      select p.tenant_id from public.profiles p where p.id = auth.uid()
    )
  );

create policy if not exists "platform_binding_sessions_update_own_tenant"
  on public.platform_binding_sessions
  for update
  using (
    tenant_id in (
      select p.tenant_id from public.profiles p where p.id = auth.uid()
    )
  )
  with check (
    tenant_id in (
      select p.tenant_id from public.profiles p where p.id = auth.uid()
    )
  );
