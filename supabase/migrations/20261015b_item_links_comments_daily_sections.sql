-- Overhaul steps 3-4: related items, comment attachments, all 20 daily log sections.

-- Related items: link any tool item to any other, in both directions.
CREATE TABLE IF NOT EXISTS public.item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  from_type text NOT NULL,
  from_id uuid NOT NULL,
  to_type text NOT NULL,
  to_id uuid NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_links_not_self CHECK (NOT (from_type = to_type AND from_id = to_id)),
  CONSTRAINT item_links_unique UNIQUE (tenant_id, from_type, from_id, to_type, to_id)
);
CREATE INDEX IF NOT EXISTS idx_item_links_from ON public.item_links (tenant_id, from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_item_links_to ON public.item_links (tenant_id, to_type, to_id);
ALTER TABLE public.item_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_links_svc ON public.item_links;
CREATE POLICY item_links_svc ON public.item_links FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Comments on any item: attachments + who wrote them (uuid) + official answer flag.
ALTER TABLE public.entity_comments ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.entity_comments ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;
ALTER TABLE public.entity_comments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_entity_comments_entity ON public.entity_comments (tenant_id, entity_type, entity_id, created_at);

-- Daily log: the sections that have no column of their own live here, one key per section.
ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS log_sections jsonb NOT NULL DEFAULT '{}'::jsonb;
