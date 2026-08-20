-- Remove hardcoded AZ defaults — this is a 50-state product
ALTER TABLE lien_deadlines ALTER COLUMN state DROP DEFAULT;
ALTER TABLE lien_deadlines ALTER COLUMN state DROP NOT NULL;

ALTER TABLE subcontractors ALTER COLUMN state DROP DEFAULT;

-- Performance indexes for portal + dashboard queries
CREATE INDEX IF NOT EXISTS idx_lien_waivers_token ON lien_waivers(token);
CREATE INDEX IF NOT EXISTS idx_lien_waivers_project_id ON lien_waivers(project_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_lien_deadlines_project_id ON lien_deadlines(project_id, tenant_id);
