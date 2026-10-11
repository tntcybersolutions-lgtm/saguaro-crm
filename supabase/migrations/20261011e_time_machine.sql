-- ═══════════════════════════════════════════════════════════════════════════
-- TIME MACHINE — one-click restore of customer data, free, inside Postgres.
--
-- Every insert / update / delete on a company-data table (tenant_id + uuid id)
-- writes one row to recovery.row_history: which row, what happened, and the
-- row as it was BEFORE (for updates and deletes). Restoring to time T takes,
-- for every row touched since T, the FIRST change after T and puts the row
-- back the way it was: created after T → deleted; changed or deleted after T
-- → its old self upserted. Scope: the whole platform, one company, or one job.
--
-- A restore is itself recorded (tagged with its batch), so "Undo this restore"
-- is just a restore to the moment the restore started.
--
-- Covers: the database rows of every company table (423 on 11 Oct 2026). Does NOT cover: uploaded
-- files (Storage objects), auth logins, or a lost/deleted project — those are
-- Supabase's daily backups. History is kept 30 days (pg_cron prunes nightly).
-- All functions run SECURITY DEFINER and are callable by service_role only.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists recovery;
revoke all on schema recovery from public, anon, authenticated;
grant usage on schema recovery to service_role;

create table if not exists recovery.row_history (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default clock_timestamp(),
  tenant_id  uuid,
  project_id uuid,
  tbl        text not null,
  row_id     uuid not null,
  op         char(1) not null check (op in ('I', 'U', 'D')),
  old_row    jsonb,
  actor      uuid,
  batch      text
);
create index if not exists row_history_at_idx      on recovery.row_history (at);
create index if not exists row_history_tenant_idx  on recovery.row_history (tenant_id, at);
create index if not exists row_history_project_idx on recovery.row_history (project_id, at) where project_id is not null;
create index if not exists row_history_row_idx     on recovery.row_history (tbl, row_id);
create index if not exists row_history_batch_idx   on recovery.row_history (batch) where batch is not null;
alter table recovery.row_history enable row level security;
revoke all on recovery.row_history from public, anon, authenticated;

-- A uuid from text, or null — never an error inside a trigger.
create or replace function recovery.as_uuid(v text) returns uuid
language sql immutable set search_path = '' as $$
  select case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid end
$$;

-- The capture trigger. It never blocks a write: any failure is a warning.
create or replace function recovery.capture() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  rid uuid;
begin
  begin
    r := case when tg_op = 'INSERT' then to_jsonb(new) else to_jsonb(old) end;
    rid := recovery.as_uuid(r->>'id');
    if rid is not null then
      insert into recovery.row_history (tenant_id, project_id, tbl, row_id, op, old_row, actor, batch)
      values (
        recovery.as_uuid(r->>'tenant_id'),
        recovery.as_uuid(r->>'project_id'),
        tg_table_name,
        rid,
        left(tg_op, 1),
        case when tg_op = 'INSERT' then null else r end,
        recovery.as_uuid(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'sub')),
        nullif(current_setting('recovery.batch', true), '')
      );
    end if;
  exception when others then
    raise warning 'recovery.capture skipped %: %', tg_table_name, sqlerrm;
  end;
  return null;
end $$;

-- Company-data tables: public, base table, has tenant_id and a uuid id that is
-- unique (a restore upserts ON CONFLICT (id); a stray copy table without a
-- unique id, e.g. zz_backup_projects_20260831, would make every restore fail).
create or replace function recovery.covered_tables() returns setof text
language sql stable set search_path = '' as $$
  select c.table_name::text
  from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'tenant_id'
    and exists (select 1 from information_schema.columns i
                where i.table_schema = 'public' and i.table_name = c.table_name and i.column_name = 'id' and i.data_type = 'uuid')
    and exists (select 1 from pg_catalog.pg_index ix
                join pg_catalog.pg_class cl on cl.oid = ix.indrelid
                join pg_catalog.pg_namespace n on n.oid = cl.relnamespace
                join pg_catalog.pg_attribute a on a.attrelid = cl.oid and a.attnum = ix.indkey[0]
                where n.nspname = 'public' and cl.relname = c.table_name and ix.indisunique
                  and ix.indnatts = 1 and a.attname = 'id' and ix.indpred is null)
  order by 1
$$;

-- Put the capture trigger on every company table (idempotent; nightly too, so
-- tables added later are covered without anyone remembering to).
create or replace function recovery.attach_all() returns int
language plpgsql security definer set search_path = '' as $$
declare t text; n int := 0;
begin
  for t in select recovery.covered_tables() loop
    if not exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
                   where s.nspname = 'public' and c.relname = t and g.tgname = 'zz_recovery_capture') then
      execute format('create trigger zz_recovery_capture after insert or update or delete on public.%I for each row execute function recovery.capture()', t);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- What a restore to p_since would put back, per table. Read-only.
create or replace function public.recovery_plan(p_since timestamptz, p_tenant uuid default null, p_project uuid default null)
returns table (tbl text, remove_created bigint, put_back_changed bigint, bring_back_deleted bigint)
language sql stable security definer set search_path = '' as $$
  with firsts as (
    select distinct on (h.tbl, h.row_id) h.tbl, h.op
    from recovery.row_history h
    where h.at >= p_since
      and (p_tenant is null or h.tenant_id = p_tenant)
      and (p_project is null or h.project_id = p_project)
    order by h.tbl, h.row_id, h.id
  )
  select f.tbl,
         count(*) filter (where f.op = 'I'),
         count(*) filter (where f.op = 'U'),
         count(*) filter (where f.op = 'D')
  from firsts f group by f.tbl order by count(*) desc
$$;

-- Restore to p_since. All-or-nothing: if any row cannot be put back, nothing is.
create or replace function public.recovery_restore(p_since timestamptz, p_tenant uuid default null, p_project uuid default null, p_label text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_batch text := 'restore:' || to_char(clock_timestamp(), 'YYYYMMDD"T"HH24MISS') || ':' || left(md5(random()::text), 6);
  v_started timestamptz := clock_timestamp();
  a record;
  pending jsonb := '[]'::jsonb;
  failed jsonb;
  item jsonb;
  progress int;
  removed int := 0;
  restored int := 0;
  last_err text;
  cols text;
  sets text;
  colcache jsonb := '{}'::jsonb;  -- tbl → {cols, sets}: the column lists, read once per table
begin
  if p_since is null or p_since > now() then raise exception 'Pick a time in the past.'; end if;
  perform set_config('recovery.batch', v_batch, true);

  -- The first change after p_since for every row in scope = the row's state at p_since.
  for a in
    select distinct on (h.tbl, h.row_id) h.tbl, h.row_id, h.op, h.old_row, h.id as hid
    from recovery.row_history h
    where h.at >= p_since
      and (p_tenant is null or h.tenant_id = p_tenant)
      and (p_project is null or h.project_id = p_project)
      and h.tbl in (select recovery.covered_tables())
    order by h.tbl, h.row_id, h.id
  loop
    pending := pending || jsonb_build_object('tbl', a.tbl, 'id', a.row_id, 'op', a.op, 'row', a.old_row, 'hid', a.hid);
  end loop;

  -- Removals first (rows that did not exist at p_since), newest first; then
  -- put-backs, oldest first. Foreign keys are satisfied by retrying until no
  -- more progress — parents land before children whatever the order.
  pending := (select coalesce(jsonb_agg(x order by (x->>'op') <> 'I', case when x->>'op' = 'I' then -(x->>'hid')::bigint else (x->>'hid')::bigint end), '[]'::jsonb) from jsonb_array_elements(pending) x);

  loop
    progress := 0;
    failed := '[]'::jsonb;
    for item in select * from jsonb_array_elements(pending) loop
      begin
        if item->>'op' = 'I' then
          execute format('delete from public.%I where id = $1', item->>'tbl') using (item->>'id')::uuid;
          removed := removed + 1;
        else
          if not colcache ? (item->>'tbl') then
            select string_agg(format('%I', column_name), ', ' order by ordinal_position),
                   string_agg(format('%1$I = excluded.%1$I', column_name), ', ' order by ordinal_position) filter (where column_name <> 'id')
              into cols, sets
            from information_schema.columns
            where table_schema = 'public' and table_name = item->>'tbl' and is_generated = 'NEVER';
            colcache := colcache || jsonb_build_object(item->>'tbl', jsonb_build_object('cols', cols, 'sets', sets));
          end if;
          cols := colcache->(item->>'tbl')->>'cols';
          sets := colcache->(item->>'tbl')->>'sets';
          execute format(
            'insert into public.%1$I (%2$s) overriding system value select %2$s from jsonb_populate_record(null::public.%1$I, $1) on conflict (id) do update set %3$s',
            item->>'tbl', cols, coalesce(sets, 'id = excluded.id'))
          using item->'row';
          restored := restored + 1;
        end if;
        progress := progress + 1;
      exception when others then
        last_err := (item->>'tbl') || ': ' || sqlerrm;
        failed := failed || item;
      end;
    end loop;
    exit when jsonb_array_length(failed) = 0 or progress = 0;
    pending := failed;
  end loop;

  if jsonb_array_length(failed) > 0 then
    raise exception 'Restore stopped — % row(s) could not be put back (%). Nothing was changed.', jsonb_array_length(failed), last_err;
  end if;

  return jsonb_build_object('batch', v_batch, 'started_at', v_started, 'since', p_since,
    'tenant_id', p_tenant, 'project_id', p_project, 'label', p_label,
    'removed', removed, 'restored', restored);
end $$;

-- Coverage and history at a glance.
create or replace function public.recovery_status()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'company_tables', (select count(*) from recovery.covered_tables()),
    'covered', (select count(*) from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
                where s.nspname = 'public' and g.tgname = 'zz_recovery_capture'),
    'history_rows', (select count(*) from recovery.row_history),
    'oldest', (select min(at) from recovery.row_history),
    'newest', (select max(at) from recovery.row_history)
  )
$$;

create or replace function public.recovery_attach_all() returns int
language sql security definer set search_path = '' as $$ select recovery.attach_all() $$;

-- service_role only — no anon / authenticated / public access to any of it.
revoke all on function public.recovery_plan(timestamptz, uuid, uuid) from public, anon, authenticated;
revoke all on function public.recovery_restore(timestamptz, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.recovery_status() from public, anon, authenticated;
revoke all on function public.recovery_attach_all() from public, anon, authenticated;
grant execute on function public.recovery_plan(timestamptz, uuid, uuid) to service_role;
grant execute on function public.recovery_restore(timestamptz, uuid, uuid, text) to service_role;
grant execute on function public.recovery_status() to service_role;
grant execute on function public.recovery_attach_all() to service_role;
revoke all on all functions in schema recovery from public, anon, authenticated;

-- Cover every company table now.
select recovery.attach_all();

-- Nightly: prune history older than 30 days; cover any table added since.
select cron.unschedule(jobid) from cron.job where jobname = 'recovery-nightly';
select cron.schedule('recovery-nightly', '17 9 * * *',
  $$delete from recovery.row_history where at < now() - interval '30 days'; select recovery.attach_all();$$);
