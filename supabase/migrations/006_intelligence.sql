-- supabase/migrations/006_intelligence.sql
-- Construction intelligence tables:
--   bid_history        — historical bid tracking for win-rate analytics and AI context
--   sub_performance    — subcontractor performance metrics by trade
--   bid_package_invites — invitation tracking per bid package

-- ─── Bid History ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bid_history (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID          NOT NULL,
  project_name    TEXT          NOT NULL,
  project_type    TEXT,
  bid_date        DATE,
  bid_amount      NUMERIC(15,2),
  actual_cost     NUMERIC(15,2),
  margin_pct      NUMERIC(5,2),
  outcome         TEXT          CHECK (outcome IN ('won','lost','pending','withdrawn')),
  loss_reason     TEXT,
  awarded_to      TEXT,
  location        TEXT,
  state           TEXT,
  trades          TEXT[],
  notes           TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ─── Sub Performance ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sub_performance (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID        NOT NULL,
  sub_id            UUID,
  sub_name          TEXT        NOT NULL,
  trade             TEXT        NOT NULL,
  email             TEXT,
  phone             TEXT,
  total_bids        INT         DEFAULT 0,
  won_bids          INT         DEFAULT 0,
  win_rate          NUMERIC(5,2) DEFAULT 0,
  avg_bid_delta     NUMERIC(5,2),  -- avg % diff between sub's bid and award price
  last_project_date DATE,
  avg_rating        NUMERIC(3,2),
  state             TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Bid Package Invites ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bid_package_invites (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID        NOT NULL,
  bid_package_id   UUID        NOT NULL,
  sub_id           UUID,
  sub_name         TEXT,
  sub_email        TEXT,
  trade            TEXT,
  status           TEXT        DEFAULT 'invited'
                               CHECK (status IN ('suggested','invited','viewed','submitted','declined')),
  invited_at       TIMESTAMPTZ,
  responded_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bid_package_id, sub_email)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bid_history_tenant
  ON bid_history (tenant_id);

CREATE INDEX IF NOT EXISTS idx_bid_history_tenant_date
  ON bid_history (tenant_id, bid_date DESC);

CREATE INDEX IF NOT EXISTS idx_bid_history_outcome
  ON bid_history (tenant_id, outcome);

CREATE INDEX IF NOT EXISTS idx_sub_performance_tenant_trade
  ON sub_performance (tenant_id, trade);

CREATE INDEX IF NOT EXISTS idx_sub_performance_win_rate
  ON sub_performance (tenant_id, win_rate DESC);

CREATE INDEX IF NOT EXISTS idx_bid_package_invites_pkg
  ON bid_package_invites (bid_package_id);

CREATE INDEX IF NOT EXISTS idx_bid_package_invites_status
  ON bid_package_invites (bid_package_id, status);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE bid_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_performance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_package_invites ENABLE ROW LEVEL SECURITY;

-- Tenants can only access their own rows
CREATE POLICY "bid_history_tenant_isolation"
  ON bid_history
  FOR ALL
  USING (tenant_id = auth.uid());

CREATE POLICY "sub_performance_tenant_isolation"
  ON sub_performance
  FOR ALL
  USING (tenant_id = auth.uid());

CREATE POLICY "bid_package_invites_tenant_isolation"
  ON bid_package_invites
  FOR ALL
  USING (tenant_id = auth.uid());
