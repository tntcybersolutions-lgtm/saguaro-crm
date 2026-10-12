-- invoices.direction — who pays whom.
--
-- The invoices table is owner billing (both create screens bill the owner),
-- but vendor / subcontract bills were filed in it too (Pima: Sonoran Electric,
-- Valley Sheet Metal, Johnson Controls …). The client portal listed every row
-- on the job, so an owner could see what the GC pays its subs — and the coming
-- "Pay online" button must never offer an owner a sub's bill.
--
--   receivable — the owner pays the GC (shown in the client portal, payable online)
--   payable    — the GC pays a vendor / sub (never shown to the owner)
alter table public.invoices add column if not exists direction text not null default 'receivable';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_direction_check') then
    alter table public.invoices add constraint invoices_direction_check check (direction in ('receivable', 'payable'));
  end if;
end $$;

-- Existing rows: a vendor / sub bill is payable — it carries a cost category,
-- names one of the company's subcontractors, or is a supplier bill with no
-- owner on it. Only a row billed to the job's owner (or a ZZ AUDIT test bill
-- to its test customer) stays receivable.
update public.invoices i set direction = 'payable'
where i.direction = 'receivable'
  and not exists (select 1 from public.projects p where p.id = i.project_id and lower(trim(p.owner_name)) = lower(trim(i.vendor_name)))
  and not (i.vendor_name ilike 'Audit Customer%')
  and (
    i.category is not null
    or exists (select 1 from public.subcontractors s where s.tenant_id = i.tenant_id and lower(trim(s.company_name)) = lower(trim(i.vendor_name)))
    or i.created_at < '2026-10-12'
  );
create index if not exists invoices_project_direction_idx on public.invoices (project_id, direction);
