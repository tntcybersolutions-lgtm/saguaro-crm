-- Photo Entity Links & Tags
-- Links photos to entities (punch items, RFIs, inspections, COs, etc.)

CREATE TABLE IF NOT EXISTS photo_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL,
  photo_url TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_title TEXT,
  linked_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(photo_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS photo_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(photo_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_photo_links_photo ON photo_entity_links(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_links_entity ON photo_entity_links(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_photo_links_project ON photo_entity_links(project_id);
CREATE INDEX IF NOT EXISTS idx_photo_tags_photo ON photo_tags(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_tags_project ON photo_tags(project_id);

ALTER TABLE photo_entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_photo_entity_links ON photo_entity_links FOR ALL USING (true);
CREATE POLICY allow_all_photo_tags ON photo_tags FOR ALL USING (true);
