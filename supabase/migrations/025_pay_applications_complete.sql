-- ─────────────────────────────────────────────────────────────────────────────
-- 025_pay_applications_complete.sql
--
-- Goal: make pay_applications accept every column name used across the codebase.
-- The DB has canonical column names; the app code uses several aliases.
-- This migration:
--   1. Adds all truly missing columns
--   2. Adds alias columns for the three naming variants of app number
--   3. Adds alias columns for other field-name mismatches
--   4. Backfills alias columns from canonical values
--   5. Creates a BEFORE INSERT OR UPDATE trigger to keep every alias
--      perfectly in sync so writes via any name are reflected everywhere
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ADD MISSING COLUMNS ───────────────────────────────────────────────────

ALTER TABLE pay_applications
  -- App-number aliases (canonical = application_number)
  ADD COLUMN IF NOT EXISTS app_number          integer,
  ADD COLUMN IF NOT EXISTS pay_app_number      integer,

  -- G702 financial fields used by GC billing routes
  ADD COLUMN IF NOT EXISTS contract_sum                  numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_sum_to_date          numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_orders_total           numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retainage_percent             numeric       DEFAULT 10,
  ADD COLUMN IF NOT EXISTS total_completed_and_stored    numeric(14,2) DEFAULT 0,

  -- Financial aliases (canonical → alias)
  -- work_completed_prev   → prev_completed
  -- work_completed_this   → this_period
  -- stored_materials      → materials_stored
  -- pct_complete          → percent_complete
  -- previous_certificates → prev_payments
  -- net_payment_due       → current_payment_due / net_amount_due
  ADD COLUMN IF NOT EXISTS prev_completed        numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS this_period           numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS materials_stored      numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percent_complete      numeric       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prev_payments         numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_payment_due   numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount_due        numeric(14,2) DEFAULT 0,

  -- Date aliases
  -- submitted_at  → submitted_date
  -- approved_at   → approved_date
  -- certified_at  → certified_date
  ADD COLUMN IF NOT EXISTS submitted_date  timestamptz,
  ADD COLUMN IF NOT EXISTS approved_date   timestamptz,
  ADD COLUMN IF NOT EXISTS certified_date  timestamptz,

  -- Owner / architect metadata
  ADD COLUMN IF NOT EXISTS owner_name          text,
  ADD COLUMN IF NOT EXISTS owner_address       text,
  ADD COLUMN IF NOT EXISTS owner_approval_token text,   -- alias for owner_portal_token
  ADD COLUMN IF NOT EXISTS owner_notes         text,
  ADD COLUMN IF NOT EXISTS owner_approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS architect_name      text,
  ADD COLUMN IF NOT EXISTS notes               text,

  -- Document URLs
  ADD COLUMN IF NOT EXISTS g702_pdf_url  text,
  ADD COLUMN IF NOT EXISTS g703_pdf_url  text,

  -- QuickBooks sync
  ADD COLUMN IF NOT EXISTS qb_synced_at  timestamptz,
  ADD COLUMN IF NOT EXISTS qb_invoice_id text;


-- ── 2. BACKFILL ALIAS COLUMNS FROM CANONICAL VALUES ─────────────────────────

UPDATE pay_applications SET
  app_number               = application_number,
  pay_app_number           = application_number,
  prev_completed           = COALESCE(work_completed_prev, 0),
  this_period              = COALESCE(work_completed_this, 0),
  materials_stored         = COALESCE(stored_materials, 0),
  percent_complete         = COALESCE(pct_complete, 0),
  prev_payments            = COALESCE(previous_certificates, 0),
  current_payment_due      = COALESCE(net_payment_due, 0),
  net_amount_due           = COALESCE(net_payment_due, 0),
  total_completed_and_stored = COALESCE(total_completed, 0) + COALESCE(stored_materials, 0),
  submitted_date           = submitted_at,
  approved_date            = approved_at,
  certified_date           = certified_at,
  owner_approval_token     = owner_portal_token;


-- ── 3. SYNC TRIGGER FUNCTION ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_pay_application_aliases()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  -- Capture OLD values safely (NULL for INSERT)
  _old_app_num          integer     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.app_number          ELSE NULL END;
  _old_pay_app_num      integer     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.pay_app_number      ELSE NULL END;
  _old_app_number       integer     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.application_number  ELSE NULL END;
  _old_submitted_at     timestamptz := CASE WHEN TG_OP = 'UPDATE' THEN OLD.submitted_at        ELSE NULL END;
  _old_submitted_date   timestamptz := CASE WHEN TG_OP = 'UPDATE' THEN OLD.submitted_date      ELSE NULL END;
  _old_approved_at      timestamptz := CASE WHEN TG_OP = 'UPDATE' THEN OLD.approved_at         ELSE NULL END;
  _old_approved_date    timestamptz := CASE WHEN TG_OP = 'UPDATE' THEN OLD.approved_date       ELSE NULL END;
  _old_certified_at     timestamptz := CASE WHEN TG_OP = 'UPDATE' THEN OLD.certified_at        ELSE NULL END;
  _old_certified_date   timestamptz := CASE WHEN TG_OP = 'UPDATE' THEN OLD.certified_date      ELSE NULL END;
  _old_wcp              numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.work_completed_prev  ELSE NULL END;
  _old_prev_completed   numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.prev_completed      ELSE NULL END;
  _old_wct              numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.work_completed_this  ELSE NULL END;
  _old_this_period      numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.this_period         ELSE NULL END;
  _old_sm               numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.stored_materials    ELSE NULL END;
  _old_ms               numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.materials_stored    ELSE NULL END;
  _old_pct              numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.pct_complete        ELSE NULL END;
  _old_pct2             numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.percent_complete    ELSE NULL END;
  _old_pc               numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.previous_certificates ELSE NULL END;
  _old_pp               numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.prev_payments       ELSE NULL END;
  _old_npd              numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.net_payment_due     ELSE NULL END;
  _old_cpd              numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.current_payment_due ELSE NULL END;
  _old_nad              numeric     := CASE WHEN TG_OP = 'UPDATE' THEN OLD.net_amount_due      ELSE NULL END;
  _old_opt              text        := CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_portal_token  ELSE NULL END;
  _old_oat              text        := CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_approval_token ELSE NULL END;
BEGIN

  -- ── App number: application_number is canonical; aliases follow it.
  --    But if code writes via alias and canonical is unchanged, adopt the alias.
  IF NEW.application_number IS DISTINCT FROM _old_app_number THEN
    NEW.app_number     := NEW.application_number;
    NEW.pay_app_number := NEW.application_number;
  ELSIF NEW.app_number IS DISTINCT FROM _old_app_num THEN
    NEW.application_number := NEW.app_number;
    NEW.pay_app_number     := NEW.app_number;
  ELSIF NEW.pay_app_number IS DISTINCT FROM _old_pay_app_num THEN
    NEW.application_number := NEW.pay_app_number;
    NEW.app_number         := NEW.pay_app_number;
  END IF;

  -- ── submitted_at ↔ submitted_date
  IF NEW.submitted_at IS DISTINCT FROM _old_submitted_at THEN
    NEW.submitted_date := NEW.submitted_at;
  ELSIF NEW.submitted_date IS DISTINCT FROM _old_submitted_date THEN
    NEW.submitted_at := NEW.submitted_date;
  END IF;

  -- ── approved_at ↔ approved_date
  IF NEW.approved_at IS DISTINCT FROM _old_approved_at THEN
    NEW.approved_date := NEW.approved_at;
  ELSIF NEW.approved_date IS DISTINCT FROM _old_approved_date THEN
    NEW.approved_at := NEW.approved_date;
  END IF;

  -- ── certified_at ↔ certified_date
  IF NEW.certified_at IS DISTINCT FROM _old_certified_at THEN
    NEW.certified_date := NEW.certified_at;
  ELSIF NEW.certified_date IS DISTINCT FROM _old_certified_date THEN
    NEW.certified_at := NEW.certified_date;
  END IF;

  -- ── work_completed_prev ↔ prev_completed
  IF NEW.work_completed_prev IS DISTINCT FROM _old_wcp THEN
    NEW.prev_completed := NEW.work_completed_prev;
  ELSIF NEW.prev_completed IS DISTINCT FROM _old_prev_completed THEN
    NEW.work_completed_prev := NEW.prev_completed;
  END IF;

  -- ── work_completed_this ↔ this_period
  IF NEW.work_completed_this IS DISTINCT FROM _old_wct THEN
    NEW.this_period := NEW.work_completed_this;
  ELSIF NEW.this_period IS DISTINCT FROM _old_this_period THEN
    NEW.work_completed_this := NEW.this_period;
  END IF;

  -- ── stored_materials ↔ materials_stored
  IF NEW.stored_materials IS DISTINCT FROM _old_sm THEN
    NEW.materials_stored := NEW.stored_materials;
  ELSIF NEW.materials_stored IS DISTINCT FROM _old_ms THEN
    NEW.stored_materials := NEW.materials_stored;
  END IF;

  -- ── pct_complete ↔ percent_complete
  IF NEW.pct_complete IS DISTINCT FROM _old_pct THEN
    NEW.percent_complete := NEW.pct_complete;
  ELSIF NEW.percent_complete IS DISTINCT FROM _old_pct2 THEN
    NEW.pct_complete := NEW.percent_complete;
  END IF;

  -- ── previous_certificates ↔ prev_payments
  IF NEW.previous_certificates IS DISTINCT FROM _old_pc THEN
    NEW.prev_payments := NEW.previous_certificates;
  ELSIF NEW.prev_payments IS DISTINCT FROM _old_pp THEN
    NEW.previous_certificates := NEW.prev_payments;
  END IF;

  -- ── net_payment_due ↔ current_payment_due ↔ net_amount_due
  IF NEW.net_payment_due IS DISTINCT FROM _old_npd THEN
    NEW.current_payment_due := NEW.net_payment_due;
    NEW.net_amount_due       := NEW.net_payment_due;
  ELSIF NEW.current_payment_due IS DISTINCT FROM _old_cpd THEN
    NEW.net_payment_due := NEW.current_payment_due;
    NEW.net_amount_due   := NEW.current_payment_due;
  ELSIF NEW.net_amount_due IS DISTINCT FROM _old_nad THEN
    NEW.net_payment_due      := NEW.net_amount_due;
    NEW.current_payment_due  := NEW.net_amount_due;
  END IF;

  -- ── owner_portal_token ↔ owner_approval_token
  IF NEW.owner_portal_token IS DISTINCT FROM _old_opt THEN
    NEW.owner_approval_token := NEW.owner_portal_token;
  ELSIF NEW.owner_approval_token IS DISTINCT FROM _old_oat THEN
    NEW.owner_portal_token := NEW.owner_approval_token;
  END IF;

  -- ── total_completed_and_stored: always recompute from best-known values
  NEW.total_completed_and_stored :=
    COALESCE(NEW.total_completed, 0) +
    COALESCE(NEW.stored_materials, NEW.materials_stored, 0);

  RETURN NEW;
END;
$$;

-- ── 4. ATTACH TRIGGER ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sync_pay_application_aliases ON pay_applications;

CREATE TRIGGER trg_sync_pay_application_aliases
  BEFORE INSERT OR UPDATE ON pay_applications
  FOR EACH ROW EXECUTE FUNCTION sync_pay_application_aliases();


-- ── 5. INDEXES FOR NEW ALIAS COLUMNS ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pay_apps_app_number
  ON pay_applications(project_id, app_number);

CREATE INDEX IF NOT EXISTS idx_pay_apps_qb_invoice
  ON pay_applications(qb_invoice_id)
  WHERE qb_invoice_id IS NOT NULL;
