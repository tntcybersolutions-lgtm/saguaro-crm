-- Change history for every tool item.
--
-- One trigger function writes a row to audit_logs whenever an RFI, submittal,
-- punch item, daily log, change order, budget line, contract, etc. is created,
-- edited or deleted: who did it, when, and for an edit the old and new value of
-- every field that changed. It runs inside the database, so every path that
-- writes (web, iPhone, background jobs, imports) is recorded the same way.
--
-- Who: the app's server talks to the database with the service role, so
-- auth.uid() is empty. lib/supabase-server.ts adds an `x-actor-id` header to
-- every write, taken from the already-verified session of the request; the
-- trigger reads it from PostgREST's request.headers. auth.uid() is the fallback
-- for direct client writes.
--
-- Safety: a failure here never blocks the user's save. The whole body is in an
-- exception block that logs a warning and returns.

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_project
  ON public.audit_logs (tenant_id, project_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_item_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n jsonb; o jsonb; ent jsonb;
  ch jsonb := '{}'::jsonb; prev jsonb := '{}'::jsonb;
  k text; act text; hdr json; actor uuid; aname text; aemail text; tid uuid; pid uuid;
  skip text[] := ARRAY['updated_at','created_at','search_vector','embedding','fts','last_activity_at','last_viewed_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    o := to_jsonb(OLD); ent := o; act := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    n := to_jsonb(NEW); ent := n; act := 'created';
  ELSE
    n := to_jsonb(NEW); o := to_jsonb(OLD); ent := n;
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      CONTINUE WHEN k = ANY(skip);
      IF (n -> k) IS DISTINCT FROM (o -> k) THEN
        ch := ch || jsonb_build_object(k, n -> k);
        prev := prev || jsonb_build_object(k, o -> k);
      END IF;
    END LOOP;
    IF ch = '{}'::jsonb THEN RETURN NULL; END IF;
    act := CASE
      WHEN ch ? 'deleted_at' AND (n ->> 'deleted_at') IS NOT NULL THEN 'deleted'
      WHEN ch ? 'deleted_at' AND (n ->> 'deleted_at') IS NULL THEN 'restored'
      WHEN ch ? 'status' THEN 'status_changed'
      ELSE 'updated' END;
  END IF;

  tid := NULLIF(ent ->> 'tenant_id', '')::uuid;
  IF tid IS NULL THEN RETURN NULL; END IF;
  pid := CASE WHEN TG_TABLE_NAME = 'projects' THEN (ent ->> 'id')::uuid
              ELSE NULLIF(ent ->> 'project_id', '')::uuid END;

  BEGIN
    hdr := NULLIF(current_setting('request.headers', true), '')::json;
    actor := NULLIF(hdr ->> 'x-actor-id', '')::uuid;
  EXCEPTION WHEN others THEN actor := NULL;
  END;
  IF actor IS NULL THEN actor := auth.uid(); END IF;
  IF actor IS NOT NULL THEN
    SELECT p.full_name, p.email INTO aname, aemail FROM public.profiles p WHERE p.id = actor;
  END IF;

  INSERT INTO public.audit_logs
    (tenant_id, project_id, user_id, user_name, user_email, action, entity_type, entity_id, entity_name, changes, previous_values)
  VALUES
    (tid, pid, actor, aname, aemail, act, TG_TABLE_NAME, (ent ->> 'id')::uuid,
     left(coalesce(ent ->> 'title', ent ->> 'subject', ent ->> 'name', ent ->> 'number',
                   ent ->> 'rfi_number', ent ->> 'co_number', ent ->> 'description'), 200),
     CASE WHEN TG_OP = 'UPDATE' THEN ch END,
     CASE WHEN TG_OP = 'UPDATE' THEN prev END);
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'record_item_history on %: %', TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_item_history() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rfis','submittals','punch_list','daily_logs','change_orders','change_events',
    'inspections','safety_incidents','observations','budget_lines','contracts',
    'commitments','prime_contracts','purchase_orders','pay_applications','invoices',
    'bills','schedule_tasks','drawings','specifications','spec_sections','photos',
    'meetings','timesheets','tm_tickets','bid_packages','lien_waivers','transmittals',
    'leads','subcontractors','projects'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_item_history ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_item_history AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_item_history()', t);
    END IF;
  END LOOP;
END $$;
