-- Eight storage policies compared a PROJECT'S NAME against a project id.
--
-- Each contained, inside its EXISTS:
--
--   FROM projects p WHERE (p.id)::text = (storage.foldername(p.name))[2]
--
-- The author meant the OBJECT's name -- the storage path being written or read.
-- But `projects` has a `name` column of its own, so inside the subquery the
-- reference bound to the project's TITLE and the policy parsed
-- "Desert Vista Medical Plaza" as a folder path. Both sides are text, so
-- Postgres had no reason to complain.
--
-- Proven before changing anything:
--   storage.foldername('Desert Vista Medical Plaza')  ->  {}     (empty array)
--   (...)[2]                                          ->  NULL
--   p.id::text = NULL                                 ->  NULL, never true
--
-- The EXISTS could never be satisfied, so these policies granted nothing and
-- everything under projects/<id>/... answered 403 to every authenticated user.
--
-- WHAT IT BROKE. The field app uploads straight to storage with the user's JWT
-- (lib/sync/syncEngine.ts), not through an API route, so RLS is the only gate:
--
--   app/photos.tsx     prefix 'projects/<id>/photos'    -- jobsite photos
--   app/drawings.tsx   prefix 'projects/<id>/drawings'  -- drawing sets
--
-- Both sat in the offline queue retrying a permanent 403. The app said
-- "will sync" and the photo never arrived. Screens building
-- '<tenantId>/projects/<id>/...' were fine, because those match the sibling
-- tenant-folder policies -- which is why some photo uploads worked and this
-- went unnoticed.
--
-- THIS IS A WIDENING, DELIBERATELY NARROW. The policies granted nothing; they
-- now grant exactly what they were written to grant -- objects under a project
-- belonging to the caller's tenant. The tenant test is untouched. The alias is
-- renamed to `pr` so a future unqualified `name` cannot bind to the wrong
-- table again.
--
-- Verified after applying, as a signed-in user:
--   photo    into my own project    -> uploaded
--   drawing  into my own project    -> uploaded
--   photo    into another tenant's  -> denied
--   document into my own project    -> uploaded
--   document into another tenant's  -> denied
--   listing my own project folder   -> 5 objects (was 0)

-- project-files: projects/<projectId>/...
DROP POLICY IF EXISTS pf_proj_path_select ON storage.objects;
DROP POLICY IF EXISTS pf_proj_path_insert ON storage.objects;
DROP POLICY IF EXISTS pf_proj_path_update ON storage.objects;
DROP POLICY IF EXISTS pf_proj_path_delete ON storage.objects;

CREATE POLICY pf_proj_path_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(objects.name))[1] = 'projects'
  AND EXISTS (SELECT 1 FROM public.projects pr
              WHERE pr.id::text = (storage.foldername(objects.name))[2]
                AND pr.tenant_id = public.get_tenant_id())
);

CREATE POLICY pf_proj_path_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (storage.foldername(objects.name))[1] = 'projects'
  AND EXISTS (SELECT 1 FROM public.projects pr
              WHERE pr.id::text = (storage.foldername(objects.name))[2]
                AND pr.tenant_id = public.get_tenant_id())
);

CREATE POLICY pf_proj_path_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(objects.name))[1] = 'projects'
  AND EXISTS (SELECT 1 FROM public.projects pr
              WHERE pr.id::text = (storage.foldername(objects.name))[2]
                AND pr.tenant_id = public.get_tenant_id())
);

CREATE POLICY pf_proj_path_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(objects.name))[1] = 'projects'
  AND EXISTS (SELECT 1 FROM public.projects pr
              WHERE pr.id::text = (storage.foldername(objects.name))[2]
                AND pr.tenant_id = public.get_tenant_id())
);

-- documents: <projectId>/... (what saveDocument writes)
DROP POLICY IF EXISTS documents_project_path_select ON storage.objects;
DROP POLICY IF EXISTS documents_project_path_insert ON storage.objects;
DROP POLICY IF EXISTS documents_project_path_update ON storage.objects;
DROP POLICY IF EXISTS documents_project_path_delete ON storage.objects;

CREATE POLICY documents_project_path_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (SELECT 1 FROM public.projects pr
              WHERE pr.id::text = (storage.foldername(objects.name))[1]
                AND pr.tenant_id = public.get_tenant_id())
);

CREATE POLICY documents_project_path_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND EXISTS (SELECT 1 FROM public.projects pr
              WHERE pr.id::text = (storage.foldername(objects.name))[1]
                AND pr.tenant_id = public.get_tenant_id())
);

CREATE POLICY documents_project_path_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (SELECT 1 FROM public.projects pr
              WHERE pr.id::text = (storage.foldername(objects.name))[1]
                AND pr.tenant_id = public.get_tenant_id())
);

CREATE POLICY documents_project_path_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (SELECT 1 FROM public.projects pr
              WHERE pr.id::text = (storage.foldername(objects.name))[1]
                AND pr.tenant_id = public.get_tenant_id())
);

