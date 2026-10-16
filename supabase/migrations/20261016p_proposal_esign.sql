-- In-app e-signature on proposals (COMPETITOR-GAP-AUDIT gap 4).
--
-- A proposal could be generated and sent, but the customer signed out of band.
-- This adds what a defensible e-signature needs, all additive:
--
--   proposals.lead_id / line_items / locked_at
--     A deal (lead_pipeline) can carry a proposal before it is a job; the
--     proposal has real line items; once signed the content is locked.
--
--   proposal_signatures — one row per "send for signature".
--     The link token is never stored: only its SHA-256 (token_hash). The exact
--     content sent is frozen in content_snapshot and fingerprinted in
--     content_hash, so what the customer saw is what they signed. Signing is a
--     conditional update (status still open, not expired), so a token signs
--     once. Drawn signatures and the signed PDF live in the PRIVATE 'esign'
--     bucket and are only ever handed out as short-lived signed URLs.
--
--   proposal_signature_events — the audit trail: sent, viewed, signed,
--     declined, voided, with IP and user agent. Rows are immutable.

ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.lead_pipeline(id) ON DELETE SET NULL;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS locked_at timestamptz;
CREATE INDEX IF NOT EXISTS proposals_tenant_lead_idx ON public.proposals (tenant_id, lead_id) WHERE lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.proposal_signatures (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id),
  proposal_id       uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  lead_id           uuid REFERENCES public.lead_pipeline(id) ON DELETE SET NULL,
  project_id        uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  token_hash        text NOT NULL UNIQUE,
  status            text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'signed', 'declined', 'voided')),
  on_sign           text NOT NULL DEFAULT 'flag' CHECK (on_sign IN ('flag', 'win')),
  signer_name       text NOT NULL,
  signer_email      text NOT NULL,
  signer_title      text,
  message           text,
  content_snapshot  jsonb NOT NULL,
  content_hash      text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  expires_at        timestamptz NOT NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  sent_by           uuid REFERENCES auth.users(id),
  viewed_at         timestamptz,
  last_viewed_at    timestamptz,
  view_count        integer NOT NULL DEFAULT 0,
  signed_at         timestamptz,
  signed_name       text,
  signed_title      text,
  signature_method  text CHECK (signature_method IN ('drawn', 'typed')),
  signature_path    text,
  signer_ip         text,
  signer_user_agent text,
  consent_text      text,
  signed_pdf_path   text,
  signed_pdf_sha256 text CHECK (signed_pdf_sha256 IS NULL OR signed_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  declined_at       timestamptz,
  decline_reason    text,
  voided_at         timestamptz,
  voided_by         uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- A signed row carries everything the certificate prints.
  CONSTRAINT proposal_signatures_signed_complete CHECK (
    status <> 'signed' OR (signed_at IS NOT NULL AND signed_name IS NOT NULL AND signature_method IS NOT NULL
                           AND signature_path IS NOT NULL AND consent_text IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS proposal_signatures_tenant_proposal_idx ON public.proposal_signatures (tenant_id, proposal_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS proposal_signatures_tenant_lead_idx ON public.proposal_signatures (tenant_id, lead_id) WHERE lead_id IS NOT NULL;
-- One open (sent / viewed) request per proposal: a resend voids the old link first.
CREATE UNIQUE INDEX IF NOT EXISTS proposal_signatures_one_open ON public.proposal_signatures (proposal_id) WHERE status IN ('sent', 'viewed');

CREATE TABLE IF NOT EXISTS public.proposal_signature_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  signature_id  uuid NOT NULL REFERENCES public.proposal_signatures(id) ON DELETE CASCADE,
  proposal_id   uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event         text NOT NULL CHECK (event IN ('sent', 'viewed', 'signed', 'declined', 'voided')),
  actor         text NOT NULL CHECK (actor IN ('sender', 'signer')),
  actor_user_id uuid REFERENCES auth.users(id),
  ip            text,
  user_agent    text,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_signature_events_sig_idx ON public.proposal_signature_events (tenant_id, signature_id, created_at);

-- The audit trail is append-only.
CREATE OR REPLACE FUNCTION public.proposal_signature_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'proposal_signature_events rows are immutable';
END $$;
CREATE OR REPLACE TRIGGER proposal_signature_events_no_update BEFORE UPDATE ON public.proposal_signature_events
  FOR EACH ROW EXECUTE FUNCTION public.proposal_signature_events_immutable();

-- A signed row's evidence never changes; only its PDF can be attached once.
CREATE OR REPLACE FUNCTION public.proposal_signatures_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF OLD.status IN ('signed', 'declined', 'voided') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot
       OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
       OR NEW.signed_name IS DISTINCT FROM OLD.signed_name
       OR NEW.signature_path IS DISTINCT FROM OLD.signature_path
       OR NEW.signer_ip IS DISTINCT FROM OLD.signer_ip
       OR (OLD.signed_pdf_path IS NOT NULL AND NEW.signed_pdf_path IS DISTINCT FROM OLD.signed_pdf_path)
       OR (OLD.signed_pdf_sha256 IS NOT NULL AND NEW.signed_pdf_sha256 IS DISTINCT FROM OLD.signed_pdf_sha256) THEN
      RAISE EXCEPTION 'proposal signature % is %, its record is final', OLD.id, OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER proposal_signatures_guard BEFORE UPDATE ON public.proposal_signatures
  FOR EACH ROW EXECUTE FUNCTION public.proposal_signatures_guard();

-- A signed proposal's content is locked: status / links may move, the terms may not.
CREATE OR REPLACE FUNCTION public.proposals_locked_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL AND (
       NEW.locked_at IS DISTINCT FROM OLD.locked_at
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.line_items IS DISTINCT FROM OLD.line_items
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.introduction IS DISTINCT FROM OLD.introduction
    OR NEW.scope_html IS DISTINCT FROM OLD.scope_html
    OR NEW.payment_terms IS DISTINCT FROM OLD.payment_terms
    OR NEW.exclusions IS DISTINCT FROM OLD.exclusions
    OR NEW.valid_until IS DISTINCT FROM OLD.valid_until) THEN
    RAISE EXCEPTION 'proposal % was signed on % and its terms are locked', OLD.id, OLD.locked_at;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER proposals_locked_guard BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposals_locked_guard();

ALTER TABLE public.proposal_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_signature_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposal_signatures' AND policyname = 'proposal_signatures_svc') THEN
  CREATE POLICY proposal_signatures_svc ON public.proposal_signatures FOR ALL TO service_role USING (true) WITH CHECK (true);
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposal_signatures' AND policyname = 'proposal_signatures_sel') THEN
  CREATE POLICY proposal_signatures_sel ON public.proposal_signatures FOR SELECT TO authenticated USING (tenant_id = get_tenant_id());
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposal_signature_events' AND policyname = 'proposal_signature_events_svc') THEN
  CREATE POLICY proposal_signature_events_svc ON public.proposal_signature_events FOR ALL TO service_role USING (true) WITH CHECK (true);
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposal_signature_events' AND policyname = 'proposal_signature_events_sel') THEN
  CREATE POLICY proposal_signature_events_sel ON public.proposal_signature_events FOR SELECT TO authenticated USING (tenant_id = get_tenant_id());
END IF; END $$;

-- Private bucket for drawn signatures and signed PDFs. No public URL, ever.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('esign', 'esign', false, 10485760, ARRAY['image/png', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false;

-- A signature request and its events belong to the proposal's company — no
-- writer (route, script, future code) can file one under another tenant.
CREATE OR REPLACE FUNCTION public.proposal_esign_same_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t uuid;
BEGIN
  SELECT tenant_id INTO t FROM public.proposals WHERE id = NEW.proposal_id;
  IF t IS NULL OR t <> NEW.tenant_id THEN
    RAISE EXCEPTION 'proposal e-sign row must belong to the proposal''s company' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER proposal_signatures_same_tenant BEFORE INSERT OR UPDATE OF tenant_id, proposal_id ON public.proposal_signatures
  FOR EACH ROW EXECUTE FUNCTION public.proposal_esign_same_tenant();
CREATE OR REPLACE TRIGGER proposal_signature_events_same_tenant BEFORE INSERT ON public.proposal_signature_events
  FOR EACH ROW EXECUTE FUNCTION public.proposal_esign_same_tenant();
