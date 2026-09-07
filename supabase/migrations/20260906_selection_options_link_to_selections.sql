-- Let selection options hang off the live `selections` rows.
--
-- The database carries two competing models for the same idea:
--
--   selections                            flat: one row = one item, one
--                                         allowance, one chosen amount.
--                                         3 rows, read by 8 files. Live.
--
--   selection_categories                  the Buildern shape: present several
--     -> selection_options                priced options with photos and spec
--     -> selection_picks                  sheets, the client picks one.
--                                         0 rows, read by no code at all.
--
-- The rich model is the one a client actually needs and the flat one is the one
-- the product uses, so this bridges them rather than forking a third: an option
-- may now hang directly off a `selections` row. Nothing is migrated and nothing
-- is dropped — category_id keeps working for anything built on it later.
--
-- Additive and reversible. All three of those tables are empty today, so
-- relaxing category_id and adding the check constraint touches no existing row.

alter table public.selection_options
  add column if not exists selection_id uuid references public.selections(id) on delete cascade;

-- category_id was NOT NULL, which made an option unattachable to a `selections`
-- row. Relaxed so exactly one of the two parents is required, enforced below.
alter table public.selection_options
  alter column category_id drop not null;

-- An option belongs to exactly one parent. Without this an option could be
-- orphaned (priced scope attached to nothing) or double-parented (the same
-- choice priced into two different allowances).
alter table public.selection_options
  drop constraint if exists selection_options_one_parent;
alter table public.selection_options
  add constraint selection_options_one_parent
  check ((selection_id is not null) <> (category_id is not null));

create index if not exists selection_options_selection_id_idx
  on public.selection_options (selection_id);

-- selection_options has no tenant_id of its own; it is scoped through whichever
-- parent it has. The existing policy only understood category_id, so every
-- option hung off a `selections` row would have been invisible to the very
-- tenant that owns it. Replaced with one that covers both parents, using this
-- schema's get_tenant_id() helper rather than reading the JWT directly.
drop policy if exists selopt_tenant on public.selection_options;
create policy selopt_tenant on public.selection_options
  for all to authenticated
  using (
    (category_id is not null and category_id in (
      select c.id from public.selection_categories c where c.tenant_id = get_tenant_id()))
    or
    (selection_id is not null and selection_id in (
      select s.id from public.selections s where s.tenant_id = get_tenant_id()))
  )
  with check (
    (category_id is not null and category_id in (
      select c.id from public.selection_categories c where c.tenant_id = get_tenant_id()))
    or
    (selection_id is not null and selection_id in (
      select s.id from public.selections s where s.tenant_id = get_tenant_id()))
  );

comment on column public.selection_options.selection_id is
  'Parent selections row. Exactly one of selection_id / category_id is set.';
