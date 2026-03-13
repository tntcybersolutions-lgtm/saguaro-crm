-- Drawing Markups: persistence for freehand, pins, shapes, text, measurements
CREATE TABLE IF NOT EXISTS drawing_markups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_id TEXT NOT NULL,
  title TEXT,
  markup_data JSONB NOT NULL DEFAULT '{}',
  markup_type TEXT DEFAULT 'freehand',
  color TEXT DEFAULT '#EF4444',
  line_width INTEGER DEFAULT 3,
  visibility TEXT DEFAULT 'all' CHECK (visibility IN ('all', 'private')),
  created_by TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drawing_markup_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  markup_id UUID REFERENCES drawing_markups(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  author TEXT,
  author_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drawing_markups_drawing ON drawing_markups(drawing_id);
CREATE INDEX IF NOT EXISTS idx_drawing_markups_project ON drawing_markups(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_markup_comments ON drawing_markup_comments(markup_id);

ALTER TABLE drawing_markups ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_markup_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_drawing_markups ON drawing_markups FOR ALL USING (true);
CREATE POLICY allow_all_drawing_markup_comments ON drawing_markup_comments FOR ALL USING (true);
