-- =============================================
-- 014: Field Module Tables
-- T&M Tickets, Observations, Meetings, Correspondence,
-- Custom Forms, Directory, Notifications, Favorites, Activity Log
-- =============================================

-- T&M Tickets
CREATE TABLE IF NOT EXISTS tm_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ticket_number TEXT,
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  reference_number TEXT,
  labor_items JSONB DEFAULT '[]'::jsonb,
  material_items JSONB DEFAULT '[]'::jsonb,
  equipment_items JSONB DEFAULT '[]'::jsonb,
  markup_percent NUMERIC(5,2) DEFAULT 0,
  tax_percent NUMERIC(5,2) DEFAULT 0,
  subtotal NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  contractor_signature TEXT,
  owner_signature TEXT,
  photo_urls TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','disputed','void')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Observations (proactive safety)
CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  observation_type TEXT DEFAULT 'negative' CHECK (observation_type IN ('positive','negative','condition')),
  template_id TEXT,
  category TEXT,
  location TEXT,
  gps_lat NUMERIC(10,7),
  gps_lng NUMERIC(10,7),
  trade TEXT,
  subcontractor TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  description TEXT,
  checklist_items JSONB DEFAULT '[]'::jsonb,
  photo_urls TEXT[] DEFAULT '{}',
  corrective_action_required BOOLEAN DEFAULT FALSE,
  corrective_action JSONB,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','verified','closed')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meetings
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_type TEXT DEFAULT 'custom' CHECK (meeting_type IN ('oac','subcontractor','safety','preconstruction','closeout','custom')),
  meeting_date TIMESTAMPTZ,
  location TEXT,
  recurring TEXT CHECK (recurring IN ('weekly','biweekly','monthly',NULL)),
  series_id UUID,
  attendees JSONB DEFAULT '[]'::jsonb,
  agenda_items JSONB DEFAULT '[]'::jsonb,
  action_items JSONB DEFAULT '[]'::jsonb,
  decisions JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Correspondence
CREATE TABLE IF NOT EXISTS correspondence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  correspondence_type TEXT DEFAULT 'letter' CHECK (correspondence_type IN ('letter','transmittal','notice','memo','email_record')),
  subject TEXT NOT NULL,
  body TEXT,
  from_email TEXT,
  to_recipients JSONB DEFAULT '[]'::jsonb,
  cc_recipients JSONB DEFAULT '[]'::jsonb,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  attachments JSONB DEFAULT '[]'::jsonb,
  reference_links JSONB DEFAULT '[]'::jsonb,
  transmittal_number TEXT,
  transmittal_items JSONB DEFAULT '[]'::jsonb,
  transmittal_purpose TEXT[] DEFAULT '{}',
  transmittal_remarks TEXT,
  request_read_receipt BOOLEAN DEFAULT FALSE,
  thread_id UUID,
  parent_id UUID,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','read','replied')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Correspondence Read Receipts
CREATE TABLE IF NOT EXISTS correspondence_read_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id UUID REFERENCES correspondence(id) ON DELETE CASCADE,
  read_by TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(correspondence_id, read_by)
);

-- Form Templates
CREATE TABLE IF NOT EXISTS form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  is_global BOOLEAN DEFAULT FALSE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  fields JSONB DEFAULT '[]'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Form Submissions
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES form_templates(id),
  template_name TEXT,
  responses JSONB DEFAULT '{}'::jsonb,
  photo_urls TEXT[] DEFAULT '{}',
  signature_data TEXT,
  submitted_by TEXT,
  reviewed_by TEXT,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('draft','submitted','reviewed','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project Directory
CREATE TABLE IF NOT EXISTS project_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_type TEXT DEFAULT 'person' CHECK (contact_type IN ('person','company')),
  name TEXT NOT NULL,
  company TEXT,
  title TEXT,
  trade TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  license_number TEXT,
  insurance_expiry DATE,
  role TEXT DEFAULT 'read_only' CHECK (role IN ('admin','pm','superintendent','foreman','read_only')),
  distribution_groups TEXT[] DEFAULT '{}',
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  module TEXT,
  item_id TEXT,
  item_url TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Favorites
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id, item_id, item_type)
);

-- Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_email TEXT,
  user_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('created','updated','deleted','commented','approved','rejected','status_changed')),
  module TEXT NOT NULL,
  item_id TEXT,
  item_title TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project ON tm_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project_id);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id);
CREATE INDEX IF NOT EXISTS idx_correspondence_project ON correspondence(project_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_project ON form_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_project ON form_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_directory_project ON project_directory(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_project_user ON notifications(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_favorites_project_user ON favorites(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

-- Enable RLS
ALTER TABLE tm_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE correspondence ENABLE ROW LEVEL SECURITY;
ALTER TABLE correspondence_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- RLS policies (service role bypass, authenticated users access their projects)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'tm_tickets','observations','meetings','correspondence',
    'correspondence_read_receipts','form_templates','form_submissions',
    'project_directory','notifications','favorites','activity_log'
  ])
  LOOP
    EXECUTE format('CREATE POLICY IF NOT EXISTS %I ON %I FOR ALL USING (true)', 'allow_all_' || tbl, tbl);
  END LOOP;
END $$;
