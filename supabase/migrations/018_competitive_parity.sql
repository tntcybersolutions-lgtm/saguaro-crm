-- Migration 018: Complete competitive parity with Procore & Buildertrend
-- All remaining gaps: prequalification, resource planning, client portal,
-- leads pipeline, warranty claims, reporting, permissions, custom fields, etc.

-- ============================================================
-- PREQUALIFICATION (sub questionnaires + scoring)
-- ============================================================
CREATE TABLE IF NOT EXISTS prequalification_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  questions JSONB DEFAULT '[]',
  scoring_criteria JSONB DEFAULT '[]',
  required_documents JSONB DEFAULT '[]',
  auto_qualify_threshold INTEGER DEFAULT 70,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','archived','draft')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prequalification_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  form_id UUID NOT NULL REFERENCES prequalification_forms(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  subcontractor_id UUID REFERENCES subcontractors(id),
  vendor_name TEXT NOT NULL,
  vendor_email TEXT,
  answers JSONB DEFAULT '{}',
  documents JSONB DEFAULT '[]',
  score INTEGER DEFAULT 0,
  max_score INTEGER DEFAULT 100,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','under_review','qualified','disqualified','expired')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prequal_forms_tenant ON prequalification_forms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prequal_subs_form ON prequalification_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_prequal_subs_tenant ON prequalification_submissions(tenant_id);
ALTER TABLE prequalification_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE prequalification_submissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RESOURCE PLANNING (workforce across projects)
-- ============================================================
CREATE TABLE IF NOT EXISTS resource_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  person_id UUID,
  role TEXT,
  trade TEXT,
  certifications JSONB DEFAULT '[]',
  start_date DATE NOT NULL,
  end_date DATE,
  hours_per_day NUMERIC(4,1) DEFAULT 8,
  days_per_week INTEGER DEFAULT 5,
  hourly_rate NUMERIC(8,2),
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned','tentative','confirmed','released','unavailable')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resource_tenant ON resource_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_resource_project ON resource_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_resource_dates ON resource_assignments(start_date, end_date);
ALTER TABLE resource_assignments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CLIENT PORTAL ACCESS
-- ============================================================
CREATE TABLE IF NOT EXISTS client_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner','architect','consultant','investor','other')),
  access_token TEXT UNIQUE,
  permissions JSONB DEFAULT '{"photos":true,"schedule":true,"budget":false,"documents":true,"selections":true,"messages":true,"daily_logs":false,"change_orders":true,"invoices":true}',
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS client_portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  portal_user_id UUID REFERENCES client_portal_users(id),
  sender_name TEXT NOT NULL,
  sender_type TEXT DEFAULT 'client' CHECK (sender_type IN ('client','contractor')),
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_users_project ON client_portal_users(project_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_token ON client_portal_users(access_token);
CREATE INDEX IF NOT EXISTS idx_portal_messages_project ON client_portal_messages(project_id);
ALTER TABLE client_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LEAD PIPELINE (CRM sales funnel)
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  source TEXT DEFAULT 'website' CHECK (source IN ('website','referral','cold_call','social_media','trade_show','advertisement','repeat_client','other')),
  stage TEXT DEFAULT 'new_lead' CHECK (stage IN ('new_lead','contacted','qualified','proposal_sent','negotiation','won','lost','on_hold')),
  project_type TEXT,
  estimated_value NUMERIC(14,2) DEFAULT 0,
  estimated_start DATE,
  probability INTEGER DEFAULT 50,
  assigned_to TEXT,
  assigned_to_id UUID,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  description TEXT,
  notes TEXT,
  follow_up_date DATE,
  last_contact_date DATE,
  lost_reason TEXT,
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',
  converted_project_id UUID REFERENCES projects(id),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID NOT NULL REFERENCES lead_pipeline(id) ON DELETE CASCADE,
  activity_type TEXT DEFAULT 'note' CHECK (activity_type IN ('note','call','email','meeting','proposal','follow_up','site_visit','other')),
  description TEXT NOT NULL,
  outcome TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON lead_pipeline(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON lead_pipeline(tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_lead_activities ON lead_activities(lead_id);
ALTER TABLE lead_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WARRANTY CLAIMS (post-construction)
-- ============================================================
CREATE TABLE IF NOT EXISTS warranty_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  claim_number TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('structural','mechanical','electrical','plumbing','roofing','exterior','interior','appliance','landscaping','general','other')),
  location TEXT,
  reported_by TEXT,
  reported_date DATE NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','emergency')),
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','acknowledged','scheduled','in_progress','completed','denied','closed')),
  assigned_trade TEXT,
  assigned_contractor TEXT,
  scheduled_date DATE,
  completed_date DATE,
  resolution TEXT,
  cost NUMERIC(10,2) DEFAULT 0,
  covered_under_warranty BOOLEAN DEFAULT true,
  warranty_expiry DATE,
  photos JSONB DEFAULT '[]',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_project ON warranty_claims(project_id);
CREATE INDEX IF NOT EXISTS idx_warranty_tenant ON warranty_claims(tenant_id);
ALTER TABLE warranty_claims ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- REPORT TEMPLATES (saved reports)
-- ============================================================
CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('financial','schedule','safety','quality','labor','material','executive','custom')),
  modules JSONB DEFAULT '[]',
  filters JSONB DEFAULT '{}',
  columns JSONB DEFAULT '[]',
  chart_config JSONB DEFAULT '{}',
  schedule_frequency TEXT CHECK (schedule_frequency IN ('daily','weekly','monthly','quarterly',NULL)),
  schedule_recipients JSONB DEFAULT '[]',
  last_run_at TIMESTAMPTZ,
  is_default BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_tenant ON report_templates(tenant_id);
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DOCUMENT VERSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id UUID,
  file_id UUID,
  version_number INTEGER DEFAULT 1,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  change_summary TEXT,
  uploaded_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'current' CHECK (status IN ('current','superseded','draft','pending_review')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_versions_project ON document_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON document_versions(document_id);
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USER ROLES & PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS role_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL,
  project_id UUID REFERENCES projects(id),
  role_id UUID REFERENCES role_definitions(id),
  granted_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON role_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_role_assignments(user_id);
ALTER TABLE role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CUSTOM FIELDS
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  module TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT DEFAULT 'text' CHECK (field_type IN ('text','number','date','select','multi_select','checkbox','url','email','phone','textarea','currency')),
  options JSONB DEFAULT '[]',
  required BOOLEAN DEFAULT false,
  default_value TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_fields_tenant ON custom_field_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_module ON custom_field_definitions(tenant_id, module);
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DASHBOARD WIDGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL,
  layout_name TEXT DEFAULT 'default',
  widgets JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_user ON dashboard_layouts(user_id);
ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- NOTIFICATION PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL,
  channel TEXT DEFAULT 'in_app' CHECK (channel IN ('in_app','email','push','sms')),
  module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  frequency TEXT DEFAULT 'instant' CHECK (frequency IN ('instant','hourly','daily','weekly')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id, channel, module, event_type)
);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- APPROVAL WORKFLOWS (configurable routing)
-- ============================================================
CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID REFERENCES projects(id),
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  steps JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  workflow_id UUID REFERENCES approval_workflows(id),
  project_id UUID REFERENCES projects(id),
  module TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_title TEXT,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','approved','rejected','cancelled')),
  history JSONB DEFAULT '[]',
  requested_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON approval_workflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approval_requests(tenant_id);
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SUB PORTAL ACCESS
-- ============================================================
CREATE TABLE IF NOT EXISTS sub_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  subcontractor_id UUID REFERENCES subcontractors(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  company TEXT,
  access_token TEXT UNIQUE,
  permissions JSONB DEFAULT '{"bids":true,"contracts":true,"invoices":true,"documents":true,"safety":true}',
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_portal_email ON sub_portal_users(email);
CREATE INDEX IF NOT EXISTS idx_sub_portal_token ON sub_portal_users(access_token);
ALTER TABLE sub_portal_users ENABLE ROW LEVEL SECURITY;
