alter table public.workflow_runs
  add column if not exists multi_platform boolean not null default false,
  add column if not exists steps_payload jsonb not null default '{}'::jsonb,
  add column if not exists step_order jsonb not null default '[]'::jsonb,
  add column if not exists events_payload jsonb not null default '[]'::jsonb,
  add column if not exists accumulated_output text not null default '';
