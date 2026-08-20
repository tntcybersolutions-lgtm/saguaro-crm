-- ============================================================================
-- Migration 031: RLS Policies for New Safety Tables
-- ============================================================================
-- Follows the existing tenant_id-based RLS pattern from migration 021-024.
-- Service role bypasses RLS. Authenticated users access their tenant's data.
-- ============================================================================

-- ── Safety Incidents ────────────────────────────────────────────────────────

ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_incidents_select"
  ON safety_incidents FOR SELECT
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_incidents_insert"
  ON safety_incidents FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_incidents_update"
  ON safety_incidents FOR UPDATE
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_incidents_delete"
  ON safety_incidents FOR DELETE
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

-- Service role bypass
CREATE POLICY "safety_incidents_service"
  ON safety_incidents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── Safety Inspections ──────────────────────────────────────────────────────

ALTER TABLE safety_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_inspections_select"
  ON safety_inspections FOR SELECT
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_inspections_insert"
  ON safety_inspections FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_inspections_update"
  ON safety_inspections FOR UPDATE
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_inspections_delete"
  ON safety_inspections FOR DELETE
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_inspections_service"
  ON safety_inspections FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── Safety Corrective Actions ───────────────────────────────────────────────

ALTER TABLE safety_corrective_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_ca_select"
  ON safety_corrective_actions FOR SELECT
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_ca_insert"
  ON safety_corrective_actions FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_ca_update"
  ON safety_corrective_actions FOR UPDATE
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_ca_delete"
  ON safety_corrective_actions FOR DELETE
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_ca_service"
  ON safety_corrective_actions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── Safety Talks ────────────────────────────────────────────────────────────

ALTER TABLE safety_talks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_talks_select"
  ON safety_talks FOR SELECT
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_talks_insert"
  ON safety_talks FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_talks_update"
  ON safety_talks FOR UPDATE
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_talks_delete"
  ON safety_talks FOR DELETE
  TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims', true)::jsonb) ->> 'tenant_id'));

CREATE POLICY "safety_talks_service"
  ON safety_talks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── Refresh schema cache ────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
