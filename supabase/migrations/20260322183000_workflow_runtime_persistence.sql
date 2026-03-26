-- 工作流运行态、截图产物与 checkpoint 持久化

create table if not exists public.workflow_runs (
  execution_id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_id text not null,
  workflow_name text,
  status text not null check (status in ('starting', 'running', 'completed', 'failed', 'cancelled')),
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  current_platform jsonb,
  latest_checkpoint jsonb,
  handoff_required jsonb,
  error_message text,
  error_code text,
  task_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists idx_workflow_runs_tenant_created_at
  on public.workflow_runs (tenant_id, created_at desc);

create index if not exists idx_workflow_runs_tenant_status
  on public.workflow_runs (tenant_id, status);

create table if not exists public.workflow_artifacts (
  artifact_id text primary key,
  execution_id text not null references public.workflow_runs(execution_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  step_id text not null,
  artifact_type text not null default 'screenshot',
  source text not null default 'openclaw_browser',
  capture_phase text not null default 'after_action',
  mime_type text not null default 'image/png',
  storage_key text,
  preview_url text,
  live_url text,
  signed_url text,
  width integer,
  height integer,
  captured_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_workflow_artifacts_execution_captured_at
  on public.workflow_artifacts (execution_id, captured_at desc);

create index if not exists idx_workflow_artifacts_tenant_created_at
  on public.workflow_artifacts (tenant_id, created_at desc);

create table if not exists public.workflow_checkpoints (
  checkpoint_id text primary key,
  execution_id text not null references public.workflow_runs(execution_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  step_id text not null,
  step_name text,
  step_index integer not null default 0,
  attempt integer not null default 1,
  artifact_ids jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  verified_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_workflow_checkpoints_execution_verified_at
  on public.workflow_checkpoints (execution_id, verified_at desc);

alter table public.workflow_runs enable row level security;
alter table public.workflow_artifacts enable row level security;
alter table public.workflow_checkpoints enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_runs'
      and policyname = 'workflow_runs_select_own_tenant'
  ) then
    create policy "workflow_runs_select_own_tenant"
      on public.workflow_runs
      for select
      using (
        tenant_id in (
          select p.tenant_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_runs'
      and policyname = 'workflow_runs_insert_own_tenant'
  ) then
    create policy "workflow_runs_insert_own_tenant"
      on public.workflow_runs
      for insert
      with check (
        tenant_id in (
          select p.tenant_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_runs'
      and policyname = 'workflow_runs_update_own_tenant'
  ) then
    create policy "workflow_runs_update_own_tenant"
      on public.workflow_runs
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
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_artifacts'
      and policyname = 'workflow_artifacts_select_own_tenant'
  ) then
    create policy "workflow_artifacts_select_own_tenant"
      on public.workflow_artifacts
      for select
      using (
        tenant_id in (
          select p.tenant_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_artifacts'
      and policyname = 'workflow_artifacts_insert_own_tenant'
  ) then
    create policy "workflow_artifacts_insert_own_tenant"
      on public.workflow_artifacts
      for insert
      with check (
        tenant_id in (
          select p.tenant_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_artifacts'
      and policyname = 'workflow_artifacts_update_own_tenant'
  ) then
    create policy "workflow_artifacts_update_own_tenant"
      on public.workflow_artifacts
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
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_checkpoints'
      and policyname = 'workflow_checkpoints_select_own_tenant'
  ) then
    create policy "workflow_checkpoints_select_own_tenant"
      on public.workflow_checkpoints
      for select
      using (
        tenant_id in (
          select p.tenant_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workflow_checkpoints'
      and policyname = 'workflow_checkpoints_insert_own_tenant'
  ) then
    create policy "workflow_checkpoints_insert_own_tenant"
      on public.workflow_checkpoints
      for insert
      with check (
        tenant_id in (
          select p.tenant_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;
end $$;
