-- ════════════════════════════════════════════════════════════════
-- 019 — Portal Enhancements: Customer & Subcontractor Portals
-- Full competitive parity with Procore/Buildertrend
-- ════════════════════════════════════════════════════════════════

-- ─── CUSTOMER PORTAL ───────────────────────────────────────────

-- Portal sessions / access tokens for clients
CREATE TABLE IF NOT EXISTS portal_client_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  client_name text NOT NULL,
  client_email text NOT NULL,
  client_company text,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  role text NOT NULL DEFAULT 'client_portal',
  permissions jsonb NOT NULL DEFAULT '{"budget":true,"schedule":true,"photos":true,"documents":true,"change_orders":true,"selections":true,"messages":true,"daily_logs":false,"invoices":true,"punch_list":true,"warranty":true}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','expired')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_client_sessions_token ON portal_client_sessions(token);
CREATE INDEX IF NOT EXISTS idx_portal_client_sessions_tenant ON portal_client_sessions(tenant_id);

-- AI weekly project summaries
CREATE TABLE IF NOT EXISTS portal_project_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  week_ending date NOT NULL,
  summary_html text NOT NULL,
  work_completed text[],
  upcoming_milestones text[],
  budget_status jsonb DEFAULT '{}',
  weather_delays text[],
  crew_activity jsonb DEFAULT '{}',
  sent_at timestamptz,
  sent_to text[],
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_summaries_project ON portal_project_summaries(project_id, week_ending DESC);

-- Portal approval center
CREATE TABLE IF NOT EXISTS portal_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  approval_type text NOT NULL CHECK (approval_type IN ('change_order','pay_application','selection','invoice','document')),
  reference_id uuid NOT NULL,
  reference_number text,
  title text NOT NULL,
  description text,
  amount numeric(14,2),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revision_requested')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  responded_by text,
  response_notes text,
  signature_data jsonb,
  attachments jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_approvals_project ON portal_approvals(project_id, status);

-- Portal messages / communication hub
CREATE TABLE IF NOT EXISTS portal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'general',
  sender_type text NOT NULL CHECK (sender_type IN ('gc','client','sub')),
  sender_name text NOT NULL,
  sender_email text,
  sender_id uuid,
  message text NOT NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','file','photo','video','system')),
  file_url text,
  file_name text,
  file_size bigint,
  mentions text[] DEFAULT '{}',
  read_by jsonb DEFAULT '[]',
  parent_id uuid REFERENCES portal_messages(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_messages_project ON portal_messages(project_id, channel, created_at DESC);

-- Portal document vault
CREATE TABLE IF NOT EXISTS portal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('contracts','drawings','specs','permits','inspections','submittals','photos','reports','change_orders','pay_apps','warranties','other')),
  title text NOT NULL,
  description text,
  file_url text,
  file_name text,
  file_size bigint,
  file_type text,
  version integer NOT NULL DEFAULT 1,
  version_notes text,
  uploaded_by text NOT NULL,
  visible_to text[] DEFAULT '{"client","gc"}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_documents_project ON portal_documents(project_id, category);

-- Portal warranty claims (client-submitted)
CREATE TABLE IF NOT EXISTS portal_warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  claim_number text NOT NULL,
  description text NOT NULL,
  category text,
  location text,
  photos jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','assigned','in_progress','resolved','closed')),
  assigned_to text,
  assigned_sub_id uuid,
  resolution_notes text,
  resolution_photos jsonb DEFAULT '[]',
  submitted_by text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_warranty_claims_project ON portal_warranty_claims(project_id, status);

-- Portal punch list items
CREATE TABLE IF NOT EXISTS portal_punch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  item_number integer NOT NULL,
  description text NOT NULL,
  location text,
  photos jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','verified','rejected')),
  assigned_to text,
  priority text DEFAULT 'medium',
  client_signed_off boolean DEFAULT false,
  client_sign_off_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_punch_items_project ON portal_punch_items(project_id, status);

-- Client payments (Stripe integration ready)
CREATE TABLE IF NOT EXISTS portal_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  invoice_id uuid,
  pay_app_id uuid,
  amount numeric(14,2) NOT NULL,
  method text NOT NULL DEFAULT 'ach' CHECK (method IN ('ach','credit_card','check','wire')),
  stripe_payment_intent_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','refunded')),
  paid_by text NOT NULL,
  paid_at timestamptz,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_payments_project ON portal_payments(project_id);

-- ─── SUBCONTRACTOR PORTAL ──────────────────────────────────────

-- Sub portal sessions
CREATE TABLE IF NOT EXISTS portal_sub_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid,
  sub_company text NOT NULL,
  sub_contact_name text NOT NULL,
  sub_email text NOT NULL,
  sub_phone text,
  trade text,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  role text NOT NULL DEFAULT 'sub_portal',
  permissions jsonb NOT NULL DEFAULT '{"bids":true,"schedule":true,"daily_logs":true,"documents":true,"pay_apps":true,"rfis":true,"chat":true}',
  status text NOT NULL DEFAULT 'active',
  nda_signed boolean DEFAULT false,
  nda_signed_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_sub_sessions_token ON portal_sub_sessions(token);
CREATE INDEX IF NOT EXISTS idx_portal_sub_sessions_tenant ON portal_sub_sessions(tenant_id);

-- Sub daily logs
CREATE TABLE IF NOT EXISTS portal_sub_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  sub_session_id uuid NOT NULL REFERENCES portal_sub_sessions(id),
  log_date date NOT NULL,
  crew_count integer NOT NULL DEFAULT 0,
  hours_worked numeric(6,2) NOT NULL DEFAULT 0,
  work_completed text,
  work_planned_tomorrow text,
  safety_incidents text,
  material_deliveries text,
  photos jsonb DEFAULT '[]',
  gps_clock_in jsonb,
  gps_clock_out jsonb,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  gc_comments text,
  gc_correction_requested boolean DEFAULT false,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','reviewed','correction_requested')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_sub_logs_project ON portal_sub_daily_logs(project_id, log_date DESC);

-- Sub compliance documents
CREATE TABLE IF NOT EXISTS portal_sub_compliance_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sub_session_id uuid NOT NULL REFERENCES portal_sub_sessions(id),
  doc_type text NOT NULL CHECK (doc_type IN ('insurance_cert','w9','business_license','bond','safety_cert','osha_card','other')),
  file_url text,
  file_name text,
  expiration_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  auto_alert_sent boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_sub_compliance ON portal_sub_compliance_docs(sub_session_id, doc_type);

-- Sub pay app submissions
CREATE TABLE IF NOT EXISTS portal_sub_pay_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  sub_session_id uuid NOT NULL REFERENCES portal_sub_sessions(id),
  app_number integer NOT NULL,
  period_from date,
  period_to date,
  line_items jsonb NOT NULL DEFAULT '[]',
  total_this_period numeric(14,2) NOT NULL DEFAULT 0,
  retainage_percent numeric(5,2) DEFAULT 10,
  retainage_amount numeric(14,2) DEFAULT 0,
  amount_due numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','under_review','approved','disputed','paid')),
  gc_line_notes jsonb DEFAULT '{}',
  lien_waiver_type text CHECK (lien_waiver_type IN ('conditional','unconditional')),
  lien_waiver_generated boolean DEFAULT false,
  lien_waiver_signed boolean DEFAULT false,
  payment_date date,
  payment_method text,
  payment_confirmation text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_sub_pay_apps_project ON portal_sub_pay_apps(project_id, sub_session_id);

-- Sub schedule / tasks
CREATE TABLE IF NOT EXISTS portal_sub_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  sub_session_id uuid NOT NULL REFERENCES portal_sub_sessions(id),
  phase text NOT NULL,
  task_name text NOT NULL,
  description text,
  start_date date,
  end_date date,
  percent_complete integer DEFAULT 0,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','blocked')),
  checklist jsonb DEFAULT '[]',
  conflict_alert text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_sub_tasks_project ON portal_sub_tasks(project_id, sub_session_id);

-- Sub performance scorecards (10x feature)
CREATE TABLE IF NOT EXISTS portal_sub_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  sub_session_id uuid NOT NULL REFERENCES portal_sub_sessions(id),
  sub_company text NOT NULL,
  quality_rating integer CHECK (quality_rating BETWEEN 1 AND 5),
  schedule_rating integer CHECK (schedule_rating BETWEEN 1 AND 5),
  communication_rating integer CHECK (communication_rating BETWEEN 1 AND 5),
  safety_rating integer CHECK (safety_rating BETWEEN 1 AND 5),
  overall_rating numeric(3,1),
  comments text,
  rated_by uuid NOT NULL,
  rated_by_name text,
  is_preferred boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_sub_scorecards_sub ON portal_sub_scorecards(sub_session_id);
CREATE INDEX IF NOT EXISTS idx_portal_sub_scorecards_company ON portal_sub_scorecards(sub_company);

-- Sub RFI submissions through portal
CREATE TABLE IF NOT EXISTS portal_sub_rfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  sub_session_id uuid NOT NULL REFERENCES portal_sub_sessions(id),
  rfi_number text NOT NULL,
  subject text NOT NULL,
  question text NOT NULL,
  attachments jsonb DEFAULT '[]',
  response text,
  response_attachments jsonb DEFAULT '[]',
  responded_by text,
  responded_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_sub_rfis_project ON portal_sub_rfis(project_id, sub_session_id);

-- ─── RLS POLICIES ──────────────────────────────────────────────

ALTER TABLE portal_client_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_project_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_punch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sub_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sub_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sub_compliance_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sub_pay_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sub_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sub_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sub_rfis ENABLE ROW LEVEL SECURITY;

-- Service role bypass for all portal tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'portal_client_sessions','portal_project_summaries','portal_approvals',
    'portal_messages','portal_documents','portal_warranty_claims',
    'portal_punch_items','portal_payments','portal_sub_sessions',
    'portal_sub_daily_logs','portal_sub_compliance_docs','portal_sub_pay_apps',
    'portal_sub_tasks','portal_sub_scorecards','portal_sub_rfis'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_all_' || tbl, tbl);
  END LOOP;
END $$;
