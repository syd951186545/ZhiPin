insert into storage.buckets (id, name, public)
values ('workflow-screenshots', 'workflow-screenshots', true)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'workflow_screenshots_public_read'
  ) then
    create policy "workflow_screenshots_public_read"
    on storage.objects
    for select
    to public
    using (bucket_id = 'workflow-screenshots');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'workflow_screenshots_authenticated_upload'
  ) then
    create policy "workflow_screenshots_authenticated_upload"
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'workflow-screenshots');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'workflow_screenshots_authenticated_update'
  ) then
    create policy "workflow_screenshots_authenticated_update"
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'workflow-screenshots')
    with check (bucket_id = 'workflow-screenshots');
  end if;
end $$;
