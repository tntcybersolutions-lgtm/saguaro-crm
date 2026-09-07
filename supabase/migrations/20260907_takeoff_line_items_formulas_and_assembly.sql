-- Formulas and assembly provenance on estimate lines.
--
-- `formulas` is a per-ROW map of field -> formula text, e.g.
--   {"quantity": "=DRIVER*2", "unit_material_cost": "=QTY*1.15"}
--
-- Row-scoped rather than a sheet-wide cell map on purpose: a formula must stay
-- attached to its line when rows are sorted, inserted or deleted. The evaluated
-- number is still written to the real numeric column, so every existing reader
-- -- the proposal builder, the totals, the reports -- keeps seeing plain
-- numbers and never has to know formulas exist.

alter table public.takeoff_line_items
  add column if not exists formulas jsonb;

-- Which library assembly produced this line, so an expansion can be grouped,
-- re-expanded at a new driver quantity, or removed as a unit.
alter table public.takeoff_line_items
  add column if not exists assembly_id text;

create index if not exists takeoff_line_items_assembly_id_idx
  on public.takeoff_line_items (assembly_id) where assembly_id is not null;

comment on column public.takeoff_line_items.formulas is
  'field -> formula text for this row. The computed value lives in the numeric column; this is the input that produced it.';
comment on column public.takeoff_line_items.assembly_id is
  'lib/estimate-assemblies id this line was expanded from, if any.';
