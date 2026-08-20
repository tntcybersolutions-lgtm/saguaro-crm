-- Sage AI auto-populate tracking + generated_documents enrichment
-- April 19 2026

ALTER TABLE schedule_of_values ADD COLUMN IF NOT EXISTS ai_generated boolean DEFAULT false;
ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS ai_generated boolean DEFAULT false;
ALTER TABLE schedule_milestones ADD COLUMN IF NOT EXISTS ai_generated boolean DEFAULT false;

ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS ai_model text;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS title text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sov_tenant_project_line_unique'
  ) THEN
    ALTER TABLE schedule_of_values
      ADD CONSTRAINT sov_tenant_project_line_unique
      UNIQUE (tenant_id, project_id, line_number);
  END IF;
END $$;
