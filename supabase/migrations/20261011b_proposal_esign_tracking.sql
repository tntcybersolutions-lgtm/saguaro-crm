-- Proposals signed online (Chad, 2026-10-11: proposal -> e-signed contract,
-- with "the customer opened it" tracking). Reuses the e-sign tables; adds:
--   document_signatures.source_id  the record a signature is for when it is not
--                                  a documents row (a proposal). documents FK on
--                                  document_id stays as it is.
--   document_signature_requests    how often and when the signer opened the link,
--                                  and a decline with its reason.
--   proposals.decline_reason       why the client declined, shown to the GC.
alter table public.document_signatures
  add column if not exists source_id uuid;
create index if not exists document_signatures_source_id_idx
  on public.document_signatures (tenant_id, source_id) where source_id is not null;

alter table public.document_signature_requests
  add column if not exists view_count integer not null default 0,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text;

alter table public.proposals
  add column if not exists decline_reason text;
