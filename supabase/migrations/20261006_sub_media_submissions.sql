-- End-of-day photos & video from subs and their crews.
-- A sub (or anyone holding the sub's portal link) uploads from the job site and
-- chooses where it goes:
--   destination 'project' — straight into the job's Site Photos / Video library
--                           (photo_id / file_id point at the rows it created)
--   destination 'gc'      — to the GC only; nothing lands in the job until the
--                           GC taps "Add to job photos" (then photo_id / file_id fill in)
-- Either way the row is the GC's review inbox: status 'new' until someone on the
-- GC side has seen it. Bytes live in the private 'project-files' bucket.
-- Applied to project jddfvugsaosvgllbkzch on 2026-10-06.

create table if not exists public.sub_media_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  sub_id uuid,
  portal_session_id uuid,
  batch_id uuid,
  sender_company text,
  sender_name text,
  note text,
  destination text not null check (destination in ('project', 'gc')),
  kind text not null check (kind in ('image', 'video')),
  file_name text not null,
  storage_path text not null,
  thumb_path text,
  mime_type text,
  file_size bigint,
  duration_seconds numeric,
  photo_id uuid,
  file_id uuid,
  status text not null default 'new' check (status in ('new', 'seen', 'added', 'dismissed')),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);

alter table public.sub_media_submissions enable row level security;

create policy sub_media_sel on public.sub_media_submissions for select to authenticated using (tenant_id = get_tenant_id());
create policy sub_media_ins on public.sub_media_submissions for insert to authenticated with check (tenant_id = get_tenant_id());
create policy sub_media_upd on public.sub_media_submissions for update to authenticated using (tenant_id = get_tenant_id());
create policy sub_media_del on public.sub_media_submissions for delete to authenticated using (tenant_id = get_tenant_id());
create policy sub_media_svc on public.sub_media_submissions for all to service_role using (true) with check (true);

create index if not exists sub_media_project_idx on public.sub_media_submissions (tenant_id, project_id, created_at desc);
create index if not exists sub_media_new_idx on public.sub_media_submissions (tenant_id, status) where status = 'new';
create index if not exists sub_media_batch_idx on public.sub_media_submissions (batch_id);
