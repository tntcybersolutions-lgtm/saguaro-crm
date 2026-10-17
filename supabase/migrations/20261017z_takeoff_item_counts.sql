-- A takeoff is complete only when something is measured in it (lib/takeoff-status).
--
-- 1. takeoff_item_counts: measured items per takeoff — AI material lines
--    (takeoff_materials) plus measured line items (takeoff_line_items) — so a
--    list of takeoffs can tell "complete" from "marked complete, nothing in it"
--    in one read. security_invoker: the view runs with the caller's rights,
--    never the owner's.
CREATE OR REPLACE VIEW public.takeoff_item_counts WITH (security_invoker = true) AS
SELECT
  t.id        AS takeoff_id,
  t.tenant_id AS tenant_id,
  (SELECT count(*) FROM public.takeoff_materials m WHERE m.takeoff_id = t.id)
  + (SELECT count(*) FROM public.takeoff_line_items l WHERE l.takeoff_id = t.id) AS items,
  t.project_id AS project_id
FROM public.takeoffs t;

GRANT SELECT ON public.takeoff_item_counts TO authenticated, service_role;

-- 2. The data, told honestly. Two takeoffs (Pima County ADC — BAS
--    Modernization, Copper Ridge Phase II) carried status 'complete' with a
--    priced total but no drawing stored and not one measured item anywhere.
--    Nothing is made up and no figure is removed: they go back to 'pending'
--    (Not analyzed) until a drawing is measured. Idempotent — a takeoff with
--    items is never touched.
UPDATE public.takeoffs t
   SET status = 'pending'
 WHERE t.status = 'complete'
   AND NOT EXISTS (SELECT 1 FROM public.takeoff_materials m WHERE m.takeoff_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM public.takeoff_line_items l WHERE l.takeoff_id = t.id);

NOTIFY pgrst, 'reload schema';
