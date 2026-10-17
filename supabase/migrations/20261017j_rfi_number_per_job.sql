-- RFIs: numbered per job, race-safe, and one thread of responses.
--
-- 1. set_rfi_number numbered across the whole COMPANY (max over tenant_id), so
--    a new job's first RFI came out RFI-006. Procore numbers per project: each
--    job starts at RFI-001. The trigger now takes a per-job transaction lock
--    (pg_advisory_xact_lock) before reading the job's highest number, so two
--    RFIs created at the same moment on the same job cannot get the same
--    number; the unique index below is the backstop. Deleted (soft) RFIs keep
--    their numbers, so a number is never handed out twice on a job.
-- 2. rfi_responses.comment_id links a response to the thread comment it
--    mirrors, so the RFI page shows each response once.
-- 3. Test jobs only ("ZZ AUDIT …" / "ZZ QA …", one RFI each) are renumbered to
--    RFI-001. Real and demo jobs keep the numbers people have already been sent.
--
-- Additive / CREATE OR REPLACE / IF NOT EXISTS only — safe to run again.

CREATE OR REPLACE FUNCTION public.set_rfi_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  next_num integer;
BEGIN
  -- One numberer per job at a time; released at commit.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('rfi_number:' || COALESCE(NEW.project_id::text, 'tenant:' || COALESCE(NEW.tenant_id::text, '')), 0)
  );
  SELECT COALESCE(MAX(NULLIF(substring(r.rfi_number FROM '\d{1,9}'), '')::integer), 0) + 1
    INTO next_num
    FROM public.rfis r
   WHERE r.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
     AND r.project_id IS NOT DISTINCT FROM NEW.project_id;
  NEW.rfi_number := 'RFI-' || LPAD(next_num::text, 3, '0');
  RETURN NEW;
END;
$function$;

-- The backstop: one number per job.
CREATE UNIQUE INDEX IF NOT EXISTS rfis_project_rfi_number_key
  ON public.rfis (tenant_id, project_id, rfi_number)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.rfi_responses ADD COLUMN IF NOT EXISTS comment_id uuid;
CREATE INDEX IF NOT EXISTS idx_rfi_responses_comment ON public.rfi_responses (comment_id) WHERE comment_id IS NOT NULL;

-- Test-job RFIs only: a ZZ job with exactly one RFI gets RFI-001.
DO $$
BEGIN
  UPDATE public.rfis r
     SET rfi_number = 'RFI-001'
    FROM public.projects p
   WHERE p.id = r.project_id
     AND (p.name LIKE 'ZZ AUDIT %' OR p.name LIKE 'ZZ QA %')
     AND r.rfi_number <> 'RFI-001'
     AND (SELECT count(*) FROM public.rfis x WHERE x.project_id = r.project_id) = 1;
END $$;
