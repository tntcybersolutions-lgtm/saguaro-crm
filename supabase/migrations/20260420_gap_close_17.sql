-- Gap 12: Change order owner approval columns
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS owner_approval_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS owner_approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS sent_to_owner_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_actioned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS qbo_synced_at TIMESTAMPTZ;

-- Gap 4: QuickBooks bill ID on contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS qbo_bill_id TEXT;

-- Gap 4: QuickBooks invoice ID on pay_applications
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS qbo_invoice_id TEXT;

-- Gap 4: QBO connection schema used by new sync/callback routes
ALTER TABLE qbo_connections
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Gap 16: Owner portal tokens
CREATE TABLE IF NOT EXISTS owner_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  owner_name TEXT,
  owner_email TEXT,
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Gap 6: Submittals file columns
ALTER TABLE submittals
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Gap 8: Schedule task dependencies
CREATE TABLE IF NOT EXISTS schedule_task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  predecessor_id UUID NOT NULL REFERENCES schedule_tasks(id) ON DELETE CASCADE,
  successor_id UUID NOT NULL REFERENCES schedule_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT DEFAULT 'finish_to_start',
  lag_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (predecessor_id, successor_id)
);

-- Gap 13: Schedule baselines
CREATE TABLE IF NOT EXISTS schedule_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  name TEXT NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT now(),
  captured_by UUID REFERENCES auth.users(id),
  task_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_schedule_baselines_project ON schedule_baselines(project_id, captured_at DESC);
