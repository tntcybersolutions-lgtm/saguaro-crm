-- Change orders → the subcontract (commitments.approved_changes), the whole rule.
--
-- on_co_approved() (20261016d) moved a commitment only when `status` changed,
-- and only for the exact word 'approved'. So:
--   - editing the amount of an approved CO left the commitment on the old figure
--     (the contract and budget move by the difference — lib/change-order-cascade);
--   - moving a CO to another bid package left the amount on the old one;
--   - soft-deleting or hard-deleting an approved CO never took it off;
--   - the command-center flow's posting steps (schedule_updated, budget_updated —
--     still approved money, lib/job-contract CO_APPROVED_STATUSES) took it OFF.
--
-- Now the trigger computes what the CO contributed before and after the write —
-- its signed amount when it is approved, live and tied to a bid package, else 0
-- — and moves the commitment(s) by the difference. Same arithmetic as before for
-- a plain approve / reject, so existing commitment figures stay correct.

CREATE OR REPLACE FUNCTION public.on_co_approved()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old numeric := 0;
  v_new numeric := 0;
  v_approved constant text[] := ARRAY['approved', 'schedule_updated', 'budget_updated'];
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND lower(coalesce(OLD.status, '')) = ANY (v_approved)
     AND OLD.deleted_at IS NULL AND OLD.related_bid_package_id IS NOT NULL THEN
    v_old := coalesce(co_signed_amount(OLD.cost_impact::text, OLD.amount), 0);
  END IF;
  IF TG_OP IN ('UPDATE', 'INSERT')
     AND lower(coalesce(NEW.status, '')) = ANY (v_approved)
     AND NEW.deleted_at IS NULL AND NEW.related_bid_package_id IS NOT NULL THEN
    v_new := coalesce(co_signed_amount(NEW.cost_impact::text, NEW.amount), 0);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.related_bid_package_id IS NOT DISTINCT FROM NEW.related_bid_package_id THEN
    IF v_new <> v_old THEN
      UPDATE commitments
         SET approved_changes = coalesce(approved_changes, 0) + (v_new - v_old), updated_at = now()
       WHERE bid_package_id = NEW.related_bid_package_id AND tenant_id = NEW.tenant_id;
    END IF;
  ELSE
    IF v_old <> 0 THEN
      UPDATE commitments
         SET approved_changes = coalesce(approved_changes, 0) - v_old, updated_at = now()
       WHERE bid_package_id = OLD.related_bid_package_id AND tenant_id = OLD.tenant_id;
    END IF;
    IF v_new <> 0 THEN
      UPDATE commitments
         SET approved_changes = coalesce(approved_changes, 0) + v_new, updated_at = now()
       WHERE bid_package_id = NEW.related_bid_package_id AND tenant_id = NEW.tenant_id;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE TRIGGER trg_co_approved
  AFTER INSERT OR DELETE OR UPDATE OF status, amount, cost_impact, related_bid_package_id, deleted_at
  ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.on_co_approved();
