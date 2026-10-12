-- Built-in role colours → the approved palette (12 Oct 2026).
--
-- Only rows that are still an untouched system default change: is_builtin and
-- (name, colour) equal to one of the two seed generations that wrote colours
-- into role_definitions:
--   July presets (components/team/AccessManager ROLE_PRESETS):
--     Admin #F59E0B, Project Manager #F59E0B, Superintendent #22C55E,
--     Foreman #F97316, Subcontractor #8B5CF6, Read-Only #CBD5E1
--   October signup seed (lib/default-roles.ts, 29560432):
--     Project Manager #F59E0B, Superintendent #22C55E, Foreman #60A5FA,
--     Salesperson #3B82F6, Read-Only #94A3B8, Subcontractor #A855F7
-- Custom roles (is_builtin = false) and built-in roles whose colour a company
-- changed are left exactly as they are.
--
-- Repeatable: the WHERE clause only matches legacy values, so a second run
-- changes nothing. Every changed row is copied to role_color_backup_20261012
-- first; 20261012d_role_colors_approved.rollback.sql restores them.

create table if not exists public.role_color_backup_20261012 (
  role_id     uuid primary key,
  tenant_id   uuid not null,
  name        text not null,
  old_color   text,
  new_color   text not null,
  migrated_at timestamptz not null default now()
);
alter table public.role_color_backup_20261012 enable row level security;

with legacy(name, old_color, new_color) as (
  values
    ('Admin',           '#F59E0B', '#F87171'),
    ('Project Manager', '#F59E0B', '#38BDF8'),
    ('Superintendent',  '#22C55E', '#4ADE80'),
    ('Foreman',         '#F97316', '#FBBF24'),
    ('Foreman',         '#60A5FA', '#FBBF24'),
    ('Salesperson',     '#3B82F6', '#F8FAFC'),
    ('Read-Only',       '#CBD5E1', '#94A3B8'),
    ('Subcontractor',   '#8B5CF6', '#CBD5E1'),
    ('Subcontractor',   '#A855F7', '#CBD5E1')
),
targets as (
  select r.id, r.tenant_id, r.name, r.color as old_color, l.new_color
  from public.role_definitions r
  join legacy l on l.name = r.name and upper(r.color) = l.old_color
  where r.is_builtin
),
saved as (
  insert into public.role_color_backup_20261012 (role_id, tenant_id, name, old_color, new_color)
  select id, tenant_id, name, old_color, new_color from targets
  on conflict (role_id) do nothing
  returning role_id
)
update public.role_definitions r
set color = t.new_color
from targets t
where r.id = t.id;
