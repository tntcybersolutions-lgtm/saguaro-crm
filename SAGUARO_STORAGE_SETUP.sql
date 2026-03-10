-- ============================================================
-- SAGUARO CRM — SUPABASE STORAGE SETUP
-- Run this in Supabase SQL Editor AFTER the main setup SQL.
-- Creates all required storage buckets.
-- ============================================================

-- Bucket 1: documents — PDFs (pay apps, lien waivers, bonds, closeout)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,  -- 50MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- Bucket 2: blueprints — Plan/blueprint uploads for AI takeoff
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blueprints',
  'blueprints',
  false,
  104857600, -- 100MB (blueprints can be large multi-sheet PDFs)
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/tiff']
)
on conflict (id) do nothing;

-- Bucket 3: project-photos — Field photos and daily log images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-photos',
  'project-photos',
  false,
  20971520,  -- 20MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','video/mp4']
)
on conflict (id) do nothing;

-- Bucket 4: signatures — E-signature images for lien waivers, W-9, contracts
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signatures',
  'signatures',
  false,
  2097152,   -- 2MB
  ARRAY['image/png','image/jpeg']
)
on conflict (id) do nothing;

-- ── Storage Access Policies ──────────────────────────────────────────────────
-- Service role can do everything (used by backend)
-- Authenticated users can read/write their own tenant's files

-- documents bucket
create policy if not exists "service role full access on documents"
  on storage.objects for all to service_role using (bucket_id = 'documents');

create policy if not exists "authenticated users access own documents"
  on storage.objects for all to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id'))
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id'));

-- blueprints bucket
create policy if not exists "service role full access on blueprints"
  on storage.objects for all to service_role using (bucket_id = 'blueprints');

create policy if not exists "authenticated users access own blueprints"
  on storage.objects for all to authenticated
  using (bucket_id = 'blueprints' and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id'))
  with check (bucket_id = 'blueprints' and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id'));

-- project-photos bucket
create policy if not exists "service role full access on project-photos"
  on storage.objects for all to service_role using (bucket_id = 'project-photos');

create policy if not exists "authenticated users access own photos"
  on storage.objects for all to authenticated
  using (bucket_id = 'project-photos' and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id'))
  with check (bucket_id = 'project-photos' and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id'));

-- signatures bucket
create policy if not exists "service role full access on signatures"
  on storage.objects for all to service_role using (bucket_id = 'signatures');

create policy if not exists "authenticated users access own signatures"
  on storage.objects for all to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id'))
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id'));

-- ── Verification ─────────────────────────────────────────────────────────────
select
  name                          as bucket_name,
  public                        as is_public,
  round(file_size_limit / 1024 / 1024.0, 0) as max_mb,
  array_to_string(allowed_mime_types, ', ') as allowed_types
from storage.buckets
where name in ('documents','blueprints','project-photos','signatures')
order by name;
