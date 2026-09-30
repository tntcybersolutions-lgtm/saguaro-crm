-- Only one pay application per project could ever carry a schedule of values.
--
-- schedule_of_values rows are keyed to a pay application: /api/pay-apps/[id]
-- reads `.eq('pay_app_id', id)` and its PUT deletes and re-inserts by the same
-- key. But the table carried a unique constraint on
-- (tenant_id, project_id, line_number) with no pay_app_id in it, so line 1 of
-- the project could exist exactly once. Creating a G703 for a second pay
-- application failed with a duplicate key violation, and the AIA form on every
-- other application rendered zeros — its totals are derived from the lines, so
-- no lines means no contract sum, no completed-to-date and no payment due.
--
-- A G703 is per application by definition: each one is a continuation sheet
-- showing this period against previous periods. The old constraint said a
-- project has one.
--
-- Replaced with two, so both shapes stay unique and neither can collide:
--   * per pay application, for the continuation sheets
--   * per project for rows with no pay_app_id, which is the project-level
--     schedule of values a job starts from before any application exists
--
-- Postgres treats NULLs as distinct in a unique index, so the second index
-- must be partial rather than relying on the first to cover it.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schedule_of_values'::regclass
      AND conname  = 'sov_tenant_project_line_unique'
  ) THEN
    ALTER TABLE schedule_of_values DROP CONSTRAINT sov_tenant_project_line_unique;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sov_pay_app_line_unique
  ON schedule_of_values (tenant_id, project_id, pay_app_id, line_number)
  WHERE pay_app_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sov_project_line_unique
  ON schedule_of_values (tenant_id, project_id, line_number)
  WHERE pay_app_id IS NULL;
