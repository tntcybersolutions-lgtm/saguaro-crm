-- Offline field work, video: a clip kept on the phone with no signal is sent
-- later, and may be sent more than once (the first send filed it, the answer
-- never came back). Videos are project_files rows (lib/media-upload uploadVideo
-- → /api/files/record), so that table carries the phone's id the same way
-- photos, daily logs and time entries do (20261017e_offline_client_ids.sql).
--
-- Additive only: one new nullable column + a partial unique index. Rows written
-- without a client id (every file before this, and every document upload) are
-- untouched.
--
--   project_files.client_id — the phone's id for a video it kept and uploaded

ALTER TABLE public.project_files ADD COLUMN IF NOT EXISTS client_id text;

CREATE UNIQUE INDEX IF NOT EXISTS project_files_tenant_client_id_key
  ON public.project_files (tenant_id, client_id) WHERE client_id IS NOT NULL;
