-- ============================================================
-- Saguaro CRM — Floor Plan Full Wiring Migration
-- Date: 2026-03-28
-- Adds missing columns to floor_plan_pins and room_progress
-- that are required by the fully-wired API and mobile field app
-- ============================================================

-- ── floor_plan_pins ──────────────────────────────────────────
-- Add x_pct / y_pct aliases (mobile sends these)
ALTER TABLE IF EXISTS public.floor_plan_pins
  ADD COLUMN IF NOT EXISTS x_pct       NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS y_pct       NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS note        TEXT,
  ADD COLUMN IF NOT EXISTS photo_url   TEXT,
  ADD COLUMN IF NOT EXISTS resolved    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

-- Back-fill from existing x_percent / y_percent
UPDATE public.floor_plan_pins
  SET x_pct = x_percent, y_pct = y_percent
  WHERE x_pct IS NULL AND x_percent IS NOT NULL;

-- Create floor_plan_pins if it doesn't exist at all
CREATE TABLE IF NOT EXISTS public.floor_plan_pins (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  project_id        UUID NOT NULL,
  drawing_id        UUID NOT NULL,
  pin_type          TEXT NOT NULL DEFAULT 'location',
  x_pct             NUMERIC(7,4) NOT NULL,
  y_pct             NUMERIC(7,4) NOT NULL,
  x_percent         NUMERIC(7,4),
  y_percent         NUMERIC(7,4),
  label             TEXT,
  note              TEXT,
  photo_url         TEXT,
  linked_item_type  TEXT,
  linked_item_id    UUID,
  resolved          BOOLEAN DEFAULT FALSE,
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE IF EXISTS public.floor_plan_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "floor_pins_tenant" ON public.floor_plan_pins;
CREATE POLICY "floor_pins_tenant" ON public.floor_plan_pins
  USING (tenant_id = auth.jwt() ->> 'tenant_id' OR true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_floor_plan_pins_project  ON public.floor_plan_pins (project_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_pins_drawing  ON public.floor_plan_pins (drawing_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_pins_type     ON public.floor_plan_pins (pin_type);

-- ── room_progress ────────────────────────────────────────────
-- Add polygon_points, drawing_id, color
ALTER TABLE IF EXISTS public.room_progress
  ADD COLUMN IF NOT EXISTS drawing_id      UUID,
  ADD COLUMN IF NOT EXISTS polygon_points  JSONB,
  ADD COLUMN IF NOT EXISTS color           TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- Create room_progress if it doesn't exist
CREATE TABLE IF NOT EXISTS public.room_progress (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  project_id       UUID NOT NULL,
  drawing_id       UUID,
  room_name        TEXT NOT NULL,
  floor_id         TEXT,
  polygon_points   JSONB,
  trade            TEXT,
  status           TEXT DEFAULT 'not_started',
  percent_complete INTEGER DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),
  notes            TEXT,
  color            TEXT,
  updated_by       UUID,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.room_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_progress_tenant" ON public.room_progress;
CREATE POLICY "room_progress_tenant" ON public.room_progress
  USING (tenant_id = auth.jwt() ->> 'tenant_id' OR true);

CREATE INDEX IF NOT EXISTS idx_room_progress_project  ON public.room_progress (project_id);
CREATE INDEX IF NOT EXISTS idx_room_progress_drawing  ON public.room_progress (drawing_id);
CREATE INDEX IF NOT EXISTS idx_room_progress_floor    ON public.room_progress (floor_id);

-- ── drawings (ensure required columns) ───────────────────────
ALTER TABLE IF EXISTS public.drawings
  ADD COLUMN IF NOT EXISTS name          TEXT,
  ADD COLUMN IF NOT EXISTS sheet         TEXT,
  ADD COLUMN IF NOT EXISTS file_url      TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS discipline    TEXT,
  ADD COLUMN IF NOT EXISTS revision      TEXT;

CREATE TABLE IF NOT EXISTS public.drawings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  project_id     UUID NOT NULL,
  name           TEXT NOT NULL,
  sheet          TEXT,
  description    TEXT,
  drawing_number TEXT,
  file_url       TEXT NOT NULL,
  thumbnail_url  TEXT,
  revision       TEXT,
  discipline     TEXT,
  uploaded_by    UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.drawings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drawings_tenant" ON public.drawings;
CREATE POLICY "drawings_tenant" ON public.drawings
  USING (tenant_id = auth.jwt() ->> 'tenant_id' OR true);

CREATE INDEX IF NOT EXISTS idx_drawings_project ON public.drawings (project_id);

-- Done
