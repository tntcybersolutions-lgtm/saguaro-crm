-- Saved list views: shared with the company, column widths, last-updated.
-- Additive only. A view is still owned by user_id; is_shared = true makes it
-- readable by everyone in the same tenant (the API filters by tenant_id and
-- returns own + shared). Only the owner may change or delete it.
ALTER TABLE public.saved_views ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.saved_views ADD COLUMN IF NOT EXISTS column_widths jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.saved_views ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS saved_views_tenant_module_idx ON public.saved_views (tenant_id, module);
CREATE INDEX IF NOT EXISTS saved_views_user_module_idx ON public.saved_views (user_id, module);
