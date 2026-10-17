-- 20261017g_co_stages_approval_tiers.sql
--
-- Change management in three stages on one record, and approval tiers by
-- dollar amount.
--
--   stage 'pco'      Potential change: an event with a rough estimate. No money moves.
--   stage 'cor'      Change order request to the owner: priced, can be sent to the owner.
--   stage 'approved' Approved owner change order: the contract and budget have moved
--                    (lib/change-order-status writeChangeOrder, exactly once).
--
-- `status` keeps every meaning it had (draft / pending / submitted / approved /
-- rejected / void, and the franchise flow's own values). `stage` is additive and
-- a trigger keeps it honest: only an approved status is the approved stage, so
-- no writer can mark a CO "approved" by stage alone and skip the money step.
--
-- Several PCOs roll up into one COR through change_orders.cor_id (the COR's id).
-- A PCO inside a COR can never be approved on its own — the COR carries its money.
--
-- Approval tiers live on tenant_settings.co_approval_tiers (the company settings
-- table). Each approval is a row in approval_decisions (the approvals inbox
-- table), now with who (decided_by_id), at what amount, and at what level.
-- Additive and idempotent.

-- ── 1. Stage + roll-up link ─────────────────────────────────────────────────
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS stage text;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS cor_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_stage_check') THEN
    ALTER TABLE public.change_orders
      ADD CONSTRAINT change_orders_stage_check CHECK (stage IN ('pco', 'cor', 'approved'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_cor_id_fkey') THEN
    ALTER TABLE public.change_orders
      ADD CONSTRAINT change_orders_cor_id_fkey FOREIGN KEY (cor_id) REFERENCES public.change_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS change_orders_cor_id_idx ON public.change_orders (tenant_id, cor_id) WHERE cor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS change_orders_stage_idx ON public.change_orders (tenant_id, project_id, stage);

-- ── 2. Stage follows status ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.co_sync_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_approved constant text[] := ARRAY['approved', 'schedule_updated', 'budget_updated'];
  s text := lower(coalesce(NEW.status, ''));
BEGIN
  -- A PCO rolled into a COR is priced and approved on the COR, never alone:
  -- approving both would put the same money on the contract twice.
  IF NEW.cor_id IS NOT NULL AND s = ANY (v_approved) THEN
    RAISE EXCEPTION 'This potential change is part of a change order request. Approve the request instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.cor_id IS NOT NULL AND NEW.cor_id = NEW.id THEN
    NEW.cor_id := NULL;
  END IF;

  IF s = ANY (v_approved) THEN
    NEW.stage := 'approved';
  ELSIF NEW.stage = 'approved' THEN
    -- Un-approved, rejected or voided after approval: back to a request.
    NEW.stage := 'cor';
  ELSIF NEW.stage IS NULL THEN
    NEW.stage := CASE
      WHEN s IN ('draft', 'identified') OR lower(coalesce(NEW.change_type, '')) = 'pco' THEN 'pco'
      ELSE 'cor'
    END;
  END IF;

  -- Only a potential change sits inside a COR.
  IF NEW.stage <> 'pco' THEN
    NEW.cor_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_co_stage' AND tgrelid = 'public.change_orders'::regclass) THEN
    CREATE TRIGGER trg_co_stage
      BEFORE INSERT OR UPDATE ON public.change_orders
      FOR EACH ROW EXECUTE FUNCTION public.co_sync_stage();
  END IF;
END $$;

-- ── 3. Backfill: approved → approved, pending/submitted → COR, draft → PCO ──
-- The history trigger would log a "changed" entry on every existing CO for a
-- column nobody edited, so the backfill runs with triggers off for this
-- transaction only (it sets stage itself; status and money are untouched).
BEGIN;
SET LOCAL session_replication_role = replica;
UPDATE public.change_orders
   SET stage = CASE
     WHEN lower(coalesce(status, '')) IN ('approved', 'schedule_updated', 'budget_updated') THEN 'approved'
     WHEN lower(coalesce(status, '')) IN ('draft', 'identified') OR lower(coalesce(change_type, '')) = 'pco' THEN 'pco'
     ELSE 'cor'
   END
 WHERE stage IS NULL;
COMMIT;

-- ── 4. Approval tiers per company ───────────────────────────────────────────
-- [{ "upTo": 10000, "level": "Full", "approvers": 1 }, …, { "upTo": null, "level": "Admin", "approvers": 1 }]
-- NULL = not set up: one tier, Change Orders: Full, one approver (the rule before tiers).
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS co_approval_tiers jsonb;

-- ── 5. Who approved at each step ────────────────────────────────────────────
ALTER TABLE public.approval_decisions ADD COLUMN IF NOT EXISTS decided_by_id uuid;
ALTER TABLE public.approval_decisions ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.approval_decisions ADD COLUMN IF NOT EXISTS approver_role text;   -- 'internal' | 'owner'
ALTER TABLE public.approval_decisions ADD COLUMN IF NOT EXISTS approver_level text;  -- 'Edit' | 'Full' | 'Admin' at the time
CREATE INDEX IF NOT EXISTS approval_decisions_entity_idx
  ON public.approval_decisions (tenant_id, entity_type, entity_id, decided_at);

-- An approval counts toward a tier, so it must not be writable from a browser.
-- The existing FOR ALL policy let any signed-in member of the company insert
-- (or delete) decisions with the anon key. Restrictive policies close writes
-- for every browser role; the server writes with the service role, which RLS
-- does not apply to. Reads stay as they were.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'approval_decisions' AND policyname = 'server_only_insert_approval_decisions') THEN
    CREATE POLICY server_only_insert_approval_decisions ON public.approval_decisions AS RESTRICTIVE FOR INSERT WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'approval_decisions' AND policyname = 'server_only_update_approval_decisions') THEN
    CREATE POLICY server_only_update_approval_decisions ON public.approval_decisions AS RESTRICTIVE FOR UPDATE USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'approval_decisions' AND policyname = 'server_only_delete_approval_decisions') THEN
    CREATE POLICY server_only_delete_approval_decisions ON public.approval_decisions AS RESTRICTIVE FOR DELETE USING (false);
  END IF;
END $$;
