-- Related Items (procore-parity-spec §1.5): one polymorphic link between any two
-- records on a job, written once and shown on both records.
--
-- A pair is stored once, in a fixed order (a <= b by type, then id, byte order),
-- so "RFI 7 ↔ A-101" and "A-101 ↔ RFI 7" are the same row and the unique key
-- refuses the second. A guard trigger puts every insert in that order, then
-- proves both records exist in the row's company (and on the same job), so no
-- writer — the API, a script, a future route — can link across companies.
--
-- Type → table (checked against the live schema Oct 16, 2026):
--   rfi rfis · submittal submittals · change_order change_orders ·
--   punch_item punch_list · daily_log daily_logs · drawing drawings ·
--   document project_files · photo photos · inspection inspections ·
--   meeting meetings · schedule_task schedule_tasks · commitment contracts ·
--   purchase_order purchase_orders · pay_app pay_applications ·
--   invoice invoices · incident safety_incidents
-- lib/related-items.ts holds the same map for the app.

CREATE TABLE IF NOT EXISTS public.related_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  a_type text NOT NULL,
  a_id uuid NOT NULL,
  b_type text NOT NULL,
  b_id uuid NOT NULL,
  link_context jsonb NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT related_items_types CHECK (
    a_type IN ('rfi','submittal','change_order','punch_item','daily_log','drawing','document','photo','inspection','meeting','schedule_task','commitment','purchase_order','pay_app','invoice','incident')
    AND b_type IN ('rfi','submittal','change_order','punch_item','daily_log','drawing','document','photo','inspection','meeting','schedule_task','commitment','purchase_order','pay_app','invoice','incident')
  ),
  CONSTRAINT related_items_ordered CHECK (
    (a_type COLLATE "C") < (b_type COLLATE "C") OR (a_type = b_type AND a_id < b_id)
  ),
  CONSTRAINT related_items_pair_unique UNIQUE (tenant_id, a_type, a_id, b_type, b_id)
);

CREATE INDEX IF NOT EXISTS idx_related_items_a ON public.related_items (tenant_id, a_type, a_id);
CREATE INDEX IF NOT EXISTS idx_related_items_b ON public.related_items (tenant_id, b_type, b_id);
CREATE INDEX IF NOT EXISTS idx_related_items_pin ON public.related_items ((link_context->>'pin_id')) WHERE link_context ? 'pin_id';

-- The table behind each type. NULL for a type it does not know.
CREATE OR REPLACE FUNCTION public.related_item_table(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'rfi' THEN 'rfis'
    WHEN 'submittal' THEN 'submittals'
    WHEN 'change_order' THEN 'change_orders'
    WHEN 'punch_item' THEN 'punch_list'
    WHEN 'daily_log' THEN 'daily_logs'
    WHEN 'drawing' THEN 'drawings'
    WHEN 'document' THEN 'project_files'
    WHEN 'photo' THEN 'photos'
    WHEN 'inspection' THEN 'inspections'
    WHEN 'meeting' THEN 'meetings'
    WHEN 'schedule_task' THEN 'schedule_tasks'
    WHEN 'commitment' THEN 'contracts'
    WHEN 'purchase_order' THEN 'purchase_orders'
    WHEN 'pay_app' THEN 'pay_applications'
    WHEN 'invoice' THEN 'invoices'
    WHEN 'incident' THEN 'safety_incidents'
  END
$$;

-- Order the pair, then prove both sides are real records of this company on one job.
CREATE OR REPLACE FUNCTION public.related_items_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  st text; sid uuid;
  ta uuid; pa uuid; tb uuid; pb uuid;
BEGIN
  IF (NEW.a_type COLLATE "C") > (NEW.b_type COLLATE "C") OR (NEW.a_type = NEW.b_type AND NEW.a_id > NEW.b_id) THEN
    st := NEW.a_type; sid := NEW.a_id;
    NEW.a_type := NEW.b_type; NEW.a_id := NEW.b_id;
    NEW.b_type := st; NEW.b_id := sid;
  END IF;
  IF NEW.a_type = NEW.b_type AND NEW.a_id = NEW.b_id THEN
    RAISE EXCEPTION 'A record cannot be linked to itself' USING ERRCODE = '23514';
  END IF;
  IF related_item_table(NEW.a_type) IS NULL OR related_item_table(NEW.b_type) IS NULL THEN
    RAISE EXCEPTION 'Unknown related item type' USING ERRCODE = '23514';
  END IF;
  EXECUTE format('SELECT tenant_id, project_id FROM public.%I WHERE id = $1', related_item_table(NEW.a_type)) INTO ta, pa USING NEW.a_id;
  EXECUTE format('SELECT tenant_id, project_id FROM public.%I WHERE id = $1', related_item_table(NEW.b_type)) INTO tb, pb USING NEW.b_id;
  IF ta IS NULL OR ta <> NEW.tenant_id OR tb IS NULL OR tb <> NEW.tenant_id THEN
    RAISE EXCEPTION 'related_items: both records must belong to this company' USING ERRCODE = '23503';
  END IF;
  IF pa IS NOT NULL AND pb IS NOT NULL AND pa <> pb THEN
    RAISE EXCEPTION 'related_items: both records must be on the same job' USING ERRCODE = '23514';
  END IF;
  NEW.project_id := COALESCE(pa, pb, NEW.project_id);
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_auto_tenant_id BEFORE INSERT ON public.related_items
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();
-- Fires after trg_auto_tenant_id (triggers run in name order), so tenant_id is set.
CREATE OR REPLACE TRIGGER trg_related_items_guard BEFORE INSERT OR UPDATE ON public.related_items
  FOR EACH ROW EXECUTE FUNCTION related_items_guard();

ALTER TABLE public.related_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'related_items' AND policyname = 'tenant_isolation_related_items') THEN
    CREATE POLICY tenant_isolation_related_items ON public.related_items FOR ALL TO authenticated
      USING ((tenant_id)::text = (SELECT (profiles.tenant_id)::text FROM profiles WHERE profiles.id = auth.uid() LIMIT 1))
      WITH CHECK ((tenant_id)::text = (SELECT (profiles.tenant_id)::text FROM profiles WHERE profiles.id = auth.uid() LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'related_items' AND policyname = 'service_role_all_related_items') THEN
    CREATE POLICY service_role_all_related_items ON public.related_items FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Carry over what the first link table (item_links, item pages only) and the
-- drawing pins already know, so nothing linked before today goes missing.
INSERT INTO public.related_items (tenant_id, project_id, a_type, a_id, b_type, b_id, created_by, created_at)
SELECT l.tenant_id, l.project_id, f.t, l.from_id, t.t, l.to_id, l.created_by, l.created_at
FROM public.item_links l
JOIN (VALUES ('rfis','rfi'),('submittals','submittal'),('punch_list','punch_item'),('daily_logs','daily_log'),('change_orders','change_order'),('inspections','inspection'),('contracts','commitment'),('purchase_orders','purchase_order')) f(tbl, t) ON f.tbl = l.from_type
JOIN (VALUES ('rfis','rfi'),('submittals','submittal'),('punch_list','punch_item'),('daily_logs','daily_log'),('change_orders','change_order'),('inspections','inspection'),('contracts','commitment'),('purchase_orders','purchase_order')) t(tbl, t) ON t.tbl = l.to_type
ON CONFLICT ON CONSTRAINT related_items_pair_unique DO NOTHING;

INSERT INTO public.related_items (tenant_id, project_id, a_type, a_id, b_type, b_id, link_context, created_by, created_at)
SELECT p.tenant_id, p.project_id, 'drawing', p.drawing_id, k.t, p.entity_id::uuid,
       jsonb_build_object('kind','pin','pin_id',p.id,'sheet_id',p.drawing_id,'x',COALESCE(p.x_pct,p.x),'y',COALESCE(p.y_pct,p.y),'page',COALESCE(p.page_number,1)),
       p.created_by, p.created_at
FROM public.drawing_pins p
JOIN public.drawings d ON d.id = p.drawing_id AND d.tenant_id = p.tenant_id
JOIN (VALUES ('rfi','rfi'),('rfis','rfi'),('punch_item','punch_item'),('punch','punch_item'),('punch_list','punch_item')) k(et, t) ON k.et = p.entity_type
WHERE p.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND ((k.t = 'rfi' AND EXISTS (SELECT 1 FROM public.rfis r WHERE r.id = p.entity_id::uuid AND r.tenant_id = p.tenant_id AND r.project_id IS NOT DISTINCT FROM d.project_id))
    OR (k.t = 'punch_item' AND EXISTS (SELECT 1 FROM public.punch_list r WHERE r.id = p.entity_id::uuid AND r.tenant_id = p.tenant_id AND r.project_id IS NOT DISTINCT FROM d.project_id)))
ON CONFLICT ON CONSTRAINT related_items_pair_unique DO NOTHING;
