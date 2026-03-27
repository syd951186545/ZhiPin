alter table public.platform_binding_sessions
  add column if not exists output_text text;
