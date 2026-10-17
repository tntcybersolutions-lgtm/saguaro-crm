-- Reply by email: an architect / engineer / owner answers an RFI, reviews a
-- submittal or comments on a change order by replying to the email they got.
--
-- Additive only:
--   entity_comments.source / source_email   'email' when the comment came in by email
--   rfi_responses.source                    'email' for an emailed RFI response
--   rfis.answer_source                      'email' when the official answer came by email
--   inbound_email_events                    one row per inbound message: the
--     idempotency key (provider + provider_email_id), the token it carried (as
--     a SHA-256, never the token), who sent it, and what happened to it —
--     applied, rejected (with the reason), ignored or failed. Rate limiting
--     counts these rows by token_hash.
-- Idempotent: safe to run twice.

ALTER TABLE public.entity_comments ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.entity_comments ADD COLUMN IF NOT EXISTS source_email text;
ALTER TABLE public.rfi_responses ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.rfis ADD COLUMN IF NOT EXISTS answer_source text;

CREATE TABLE IF NOT EXISTS public.inbound_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_email_id text NOT NULL,
  message_id text,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  item_type text NOT NULL CHECK (item_type IN ('rfis', 'submittals', 'change_orders')),
  item_id uuid NOT NULL,
  sender_email text,
  subject text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'applied', 'rejected', 'ignored', 'failed')),
  reason text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_email_events_provider_unique UNIQUE (provider, provider_email_id)
);

CREATE INDEX IF NOT EXISTS idx_inbound_email_events_token ON public.inbound_email_events (token_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_email_events_item ON public.inbound_email_events (tenant_id, item_type, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_email_events_message ON public.inbound_email_events (tenant_id, item_id, message_id) WHERE message_id IS NOT NULL;

ALTER TABLE public.inbound_email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbound_email_events_svc ON public.inbound_email_events;
CREATE POLICY inbound_email_events_svc ON public.inbound_email_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Read-only for the company's own users (an audit trail of emailed replies); only the webhook writes.
DROP POLICY IF EXISTS inbound_email_events_tenant_read ON public.inbound_email_events;
CREATE POLICY inbound_email_events_tenant_read ON public.inbound_email_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT profiles.tenant_id FROM public.profiles WHERE profiles.id = auth.uid()));
