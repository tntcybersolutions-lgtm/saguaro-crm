-- Job meetings: numbered minutes items that carry forward meeting to meeting.
--
-- meetings and meeting_attendees already exist on production (meeting_date
-- DATE, start_time TIME, meeting_number INT, distributed_at / distributed_to,
-- attendees.attended BOOL). This adds the one missing table, meeting_items,
-- and the indexes the job screens read by. Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS public.meeting_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  number text,                                   -- "3.2" — kept when carried forward
  topic text NOT NULL,
  discussion text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  assignee_name text,
  due_date date,
  carried_from_item_id uuid REFERENCES public.meeting_items(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_items_meeting ON public.meeting_items (tenant_id, meeting_id, position);
CREATE INDEX IF NOT EXISTS idx_meeting_items_project_open ON public.meeting_items (tenant_id, project_id, status);
CREATE INDEX IF NOT EXISTS idx_meeting_items_carried_from ON public.meeting_items (carried_from_item_id);
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_project_date ON public.meetings (tenant_id, project_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting ON public.meeting_attendees (tenant_id, meeting_id);

ALTER TABLE public.meeting_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_items_svc ON public.meeting_items;
CREATE POLICY meeting_items_svc ON public.meeting_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS meeting_items_tenant ON public.meeting_items;
CREATE POLICY meeting_items_tenant ON public.meeting_items FOR ALL TO authenticated
  USING (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid()));
