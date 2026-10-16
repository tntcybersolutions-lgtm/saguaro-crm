-- Change-order and bid-award triggers stop writing the unused budget_line_items
-- table; the award's commitment is linked to the real budget (budget_lines).
--
-- BEFORE
--   on_co_approved   on a CO moving INTO approved: added the CO (by change_type,
--                    not the app's cost_impact/amount rule) to
--                    budget_line_items.approved_changes, and to the bid
--                    package's commitment. Never reversed when an approved CO
--                    was rejected or reopened.
--   on_bid_awarded   linked the new commitment to budget_line_items by
--                    csi_division and bumped that table's committed_cost.
--                    A package with no csi_division got a commitment with no
--                    division and no line.
--
-- NOW
--   The budget side of an approved CO is the app's (lib/change-order-cascade →
--   budget_lines.approved_changes, recomputed, so idempotent). The trigger no
--   longer touches any budget table, so a CO is counted on the budget once.
--   It keeps the one thing nothing else does — the subcontract's approved
--   changes on the bid package's commitment — and now reverses it when an
--   approved CO leaves approved, with the amount read the app's way
--   (lib/change-order-amount: cost_impact when non-zero, else amount).
--
--   The award's commitment is placed on a budget_lines row by the same rule as
--   lib/budget-line budgetLineFinder: exact cost code, then description, then
--   the first line in the same CSI division — trying the package's first CSI
--   code, its division, its trade, then its name. Its division falls back to
--   the CSI code's or the matched line's. Committed is derived from
--   commitments at read time (the budget route), so no budget column is bumped.

ALTER TABLE public.commitments
  ADD COLUMN IF NOT EXISTS budget_line_id uuid REFERENCES public.budget_lines(id) ON DELETE SET NULL;

-- lib/change-order-amount coAmount(), in SQL.
CREATE OR REPLACE FUNCTION public.co_signed_amount(p_cost_impact text, p_amount numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT COALESCE(
    NULLIF(CASE WHEN regexp_replace(COALESCE(p_cost_impact, ''), '[$,[:space:]]', '', 'g') ~ '^-?([0-9]+\.?[0-9]*|\.[0-9]+)$'
                THEN regexp_replace(p_cost_impact, '[$,[:space:]]', '', 'g')::numeric END, 0),
    NULLIF(p_amount, 0),
    0);
$$;

-- lib/budget-line budgetLineFinder(), in SQL: code → description → division.
CREATE OR REPLACE FUNCTION public.match_budget_line(p_project uuid, p_tenant uuid, p_key text)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $$
  WITH k AS (
    SELECT lower(regexp_replace(trim(COALESCE(p_key, '')), '\s+', ' ', 'g')) AS key
  ), kd AS (
    SELECT key, substring(key FROM '^([0-9]{2})(?:[^0-9]|$)') AS div FROM k
  ), l AS (
    SELECT bl.id,
           lower(regexp_replace(trim(COALESCE(bl.cost_code, '')), '\s+', ' ', 'g')) AS code,
           lower(regexp_replace(trim(COALESCE(bl.description, '')), '\s+', ' ', 'g')) AS descr,
           COALESCE(substring(trim(COALESCE(bl.division, '')) FROM '^([0-9]{2})(?:[^0-9]|$)'),
                    substring(trim(COALESCE(bl.cost_code, '')) FROM '^([0-9]{2})(?:[^0-9]|$)')) AS div
    FROM budget_lines bl
    WHERE bl.project_id = p_project AND bl.tenant_id = p_tenant
  )
  SELECT COALESCE(
    (SELECT l.id FROM l, kd WHERE kd.key <> '' AND l.code = kd.key ORDER BY l.code, l.id LIMIT 1),
    (SELECT l.id FROM l, kd WHERE kd.key <> '' AND l.descr = kd.key ORDER BY l.code, l.id LIMIT 1),
    (SELECT l.id FROM l, kd WHERE kd.div IS NOT NULL AND l.div = kd.div ORDER BY l.code, l.id LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.on_co_approved()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  -- Leaving approved: take it back off the subcontract it was added to.
  IF OLD.status = 'approved' AND OLD.related_bid_package_id IS NOT NULL THEN
    UPDATE commitments
       SET approved_changes = COALESCE(approved_changes, 0) - co_signed_amount(OLD.cost_impact::text, OLD.amount),
           updated_at = now()
     WHERE bid_package_id = OLD.related_bid_package_id AND tenant_id = OLD.tenant_id;
  END IF;
  -- Entering approved: the subcontract carries the change.
  IF NEW.status = 'approved' AND NEW.related_bid_package_id IS NOT NULL THEN
    UPDATE commitments
       SET approved_changes = COALESCE(approved_changes, 0) + co_signed_amount(NEW.cost_impact::text, NEW.amount),
           updated_at = now()
     WHERE bid_package_id = NEW.related_bid_package_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_bid_awarded()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_code text;
  v_line uuid;
  v_div text;
  v_commit_num text;
BEGIN
  IF NEW.status = 'awarded' AND OLD.status IS DISTINCT FROM 'awarded' THEN
    v_code := NULLIF(trim(COALESCE((NEW.csi_codes)[1], '')), '');
    v_line := COALESCE(
      match_budget_line(NEW.project_id, NEW.tenant_id, v_code),
      match_budget_line(NEW.project_id, NEW.tenant_id, NEW.csi_division),
      match_budget_line(NEW.project_id, NEW.tenant_id, NEW.trade),
      match_budget_line(NEW.project_id, NEW.tenant_id, NEW.name));
    v_div := COALESCE(
      NULLIF(trim(COALESCE(NEW.csi_division, '')), ''),
      substring(COALESCE(v_code, '') FROM '^([0-9]{2})(?:[^0-9]|$)'),
      (SELECT COALESCE(substring(trim(COALESCE(bl.division, '')) FROM '^([0-9]{2})(?:[^0-9]|$)'),
                       substring(trim(COALESCE(bl.cost_code, '')) FROM '^([0-9]{2})(?:[^0-9]|$)'))
         FROM budget_lines bl WHERE bl.id = v_line));

    SELECT 'SC-' || LPAD((COUNT(*) + 1)::text, 3, '0') INTO v_commit_num
      FROM commitments WHERE project_id = NEW.project_id;

    INSERT INTO commitments (
      project_id, tenant_id, budget_line_id,
      commitment_type, bid_package_id,
      original_amount, vendor_name, csi_division,
      description, commitment_number, status, ntp_date
    ) VALUES (
      NEW.project_id, NEW.tenant_id, v_line,
      'subcontract', NEW.id,
      COALESCE(NEW.awarded_amount, 0),
      COALESCE(NEW.awarded_to, 'TBD'),
      v_div, NEW.name,
      v_commit_num, 'active', NEW.awarded_at::date
    ) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
