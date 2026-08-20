-- ============================================================
-- 028: Design Studio Add-On — Metered Billing + Homeowner Portal
-- Recurring revenue add-on: Basic $49, Pro $99, Scale $199
-- ============================================================

-- 1. Design Add-On Subscriptions
CREATE TABLE IF NOT EXISTS design_addon_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro', 'scale')),
  stripe_subscription_id TEXT,
  stripe_connect_account_id TEXT,  -- Scale tier: contractor's Connect account
  monthly_render_limit INTEGER NOT NULL DEFAULT 15,
  renders_used_this_period INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  portal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  white_label_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  custom_logo_url TEXT,
  custom_colors JSONB DEFAULT '{}',
  payments_enabled BOOLEAN NOT NULL DEFAULT FALSE,  -- Toggle for Stripe Connect deposits
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- 2. Homeowner Portal Sessions (token-based auth like portal_client_sessions)
CREATE TABLE IF NOT EXISTS design_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  homeowner_name TEXT NOT NULL,
  homeowner_email TEXT,
  homeowner_phone TEXT,
  project_context TEXT,  -- e.g. "Kitchen remodel at 123 Main St"
  contractor_name TEXT,  -- Cached for portal display
  contractor_company TEXT,
  contractor_phone TEXT,
  contractor_email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'expired')),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  last_accessed_at TIMESTAMPTZ,
  render_count INTEGER NOT NULL DEFAULT 0,  -- Renders used by this homeowner
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Homeowner Leads (captured from portal)
CREATE TABLE IF NOT EXISTS design_portal_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portal_session_id UUID REFERENCES design_portal_sessions(id) ON DELETE SET NULL,
  homeowner_name TEXT NOT NULL,
  homeowner_email TEXT,
  homeowner_phone TEXT,
  preferred_design_session_id UUID REFERENCES design_sessions(id) ON DELETE SET NULL,
  room_type TEXT,  -- kitchen, bathroom, living_room, bedroom, exterior, etc.
  style TEXT,  -- modern, farmhouse, industrial, coastal, mid_century, etc.
  budget_range TEXT,  -- e.g. "$10K-$25K"
  message TEXT,  -- Freeform message from homeowner
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'converted', 'closed')),
  contractor_notes TEXT,
  converted_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Render Usage Tracking (monthly metering)
CREATE TABLE IF NOT EXISTS design_render_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  renders_used INTEGER NOT NULL DEFAULT 0,
  renders_limit INTEGER NOT NULL DEFAULT 15,
  overage_count INTEGER NOT NULL DEFAULT 0,
  overage_billed_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, period_start)
);

-- 5. Portal Payments (Stripe Connect deposits from homeowners)
CREATE TABLE IF NOT EXISTS design_portal_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portal_session_id UUID REFERENCES design_portal_sessions(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES design_portal_leads(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_connect_account_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,  -- 2.5% platform take
  description TEXT,  -- e.g. "Design deposit — Kitchen remodel"
  homeowner_name TEXT,
  homeowner_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Portal Activity Log (analytics for Scale tier)
CREATE TABLE IF NOT EXISTS design_portal_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portal_session_id UUID REFERENCES design_portal_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,  -- 'portal_view', 'photo_upload', 'render_complete', 'lead_submit', 'payment', 'style_browse'
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_design_addon_tenant ON design_addon_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_portal_token ON design_portal_sessions(token);
CREATE INDEX IF NOT EXISTS idx_design_portal_tenant ON design_portal_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_leads_tenant ON design_portal_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_leads_status ON design_portal_leads(status);
CREATE INDEX IF NOT EXISTS idx_design_usage_tenant ON design_render_usage(tenant_id, period_start);
CREATE INDEX IF NOT EXISTS idx_design_payments_tenant ON design_portal_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_activity_tenant ON design_portal_activity(tenant_id, created_at DESC);

-- ── Row Level Security ──
ALTER TABLE design_addon_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_portal_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_render_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_portal_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_portal_activity ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: each tenant sees only their own data
CREATE POLICY "tenant_own_design_addon" ON design_addon_subscriptions
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tenant_own_design_portal" ON design_portal_sessions
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tenant_own_design_leads" ON design_portal_leads
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tenant_own_design_usage" ON design_render_usage
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tenant_own_design_payments" ON design_portal_payments
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tenant_own_design_activity" ON design_portal_activity
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Service role bypass for API routes
CREATE POLICY "service_design_addon" ON design_addon_subscriptions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_design_portal" ON design_portal_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_design_leads" ON design_portal_leads
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_design_usage" ON design_render_usage
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_design_payments" ON design_portal_payments
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_design_activity" ON design_portal_activity
  FOR ALL USING (true) WITH CHECK (true);

-- ── RPC: Atomic render increment ──
CREATE OR REPLACE FUNCTION increment_design_render(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE design_addon_subscriptions
  SET renders_used_this_period = renders_used_this_period + 1,
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id AND status = 'active';

  -- Also log to usage tracking table
  INSERT INTO design_render_usage (tenant_id, period_start, period_end, renders_used, renders_limit)
  VALUES (
    p_tenant_id,
    DATE_TRUNC('month', NOW())::DATE,
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
    1,
    COALESCE((SELECT monthly_render_limit FROM design_addon_subscriptions WHERE tenant_id = p_tenant_id AND status = 'active'), 15)
  )
  ON CONFLICT (tenant_id, period_start)
  DO UPDATE SET renders_used = design_render_usage.renders_used + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Analytics View: Design Studio MRR ──
CREATE OR REPLACE VIEW design_studio_mrr AS
SELECT
  plan,
  COUNT(*) AS active_count,
  CASE plan
    WHEN 'basic' THEN COUNT(*) * 4900
    WHEN 'pro' THEN COUNT(*) * 9900
    WHEN 'scale' THEN COUNT(*) * 19900
    ELSE 0
  END AS mrr_cents,
  SUM(renders_used_this_period) AS total_renders_this_period
FROM design_addon_subscriptions
WHERE status = 'active'
GROUP BY plan;

-- ── Analytics View: Lead Conversion Funnel ──
CREATE OR REPLACE VIEW design_lead_funnel AS
SELECT
  tenant_id,
  COUNT(*) AS total_leads,
  COUNT(*) FILTER (WHERE status = 'new') AS new_leads,
  COUNT(*) FILTER (WHERE status = 'contacted') AS contacted,
  COUNT(*) FILTER (WHERE status = 'quoted') AS quoted,
  COUNT(*) FILTER (WHERE status = 'converted') AS converted,
  COUNT(*) FILTER (WHERE status = 'closed') AS closed,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'converted')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS conversion_rate_pct
FROM design_portal_leads
GROUP BY tenant_id;
