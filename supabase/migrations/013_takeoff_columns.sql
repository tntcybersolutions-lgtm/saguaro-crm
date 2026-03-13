-- 013_takeoff_columns.sql
-- Add analysis pipeline columns to takeoffs and takeoff_materials

ALTER TABLE public.takeoffs
  ADD COLUMN IF NOT EXISTS drawing_2d text,
  ADD COLUMN IF NOT EXISTS model_3d jsonb,
  ADD COLUMN IF NOT EXISTS cost_summary jsonb,
  ADD COLUMN IF NOT EXISTS bid_jacket_url text,
  ADD COLUMN IF NOT EXISTS excel_url text,
  ADD COLUMN IF NOT EXISTS schedule_of_values jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS sell_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_profit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_profit_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_pct numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS profit_pct numeric DEFAULT 12,
  ADD COLUMN IF NOT EXISTS contingency_pct numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS building_type text,
  ADD COLUMN IF NOT EXISTS floor_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS building_area numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recommendations jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_size_bytes integer,
  ADD COLUMN IF NOT EXISTS page_count integer;

ALTER TABLE public.takeoff_materials
  ADD COLUMN IF NOT EXISTS csi_division text DEFAULT '',
  ADD COLUMN IF NOT EXISTS labor_unit_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_material_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_labor_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crew_size integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS duration_days numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_subcontractor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recommendation text DEFAULT '',
  ADD COLUMN IF NOT EXISTS alternative_material text DEFAULT '',
  ADD COLUMN IF NOT EXISTS alternative_savings numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_score integer DEFAULT 80,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

NOTIFY pgrst, 'reload schema';
