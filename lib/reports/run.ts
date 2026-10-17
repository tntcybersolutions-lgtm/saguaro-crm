// ─────────────────────────────────────────────────────────────────────────────
// lib/reports/run.ts
//
// Shared, tenant-scoped report-run engine. This is the SINGLE source of truth for
// running an ad-hoc entity report; both POST /api/reports/run (interactive) and the
// scheduled-report cron (app/api/cron/report-schedules) import it so the two can
// never drift.
//
// SECURITY: entity, columns, filter fields, sort field and group-by are all
// validated against the report-entities whitelist before the Supabase query is
// built. Nothing is string-concatenated into SQL. The caller MUST pass a trusted
// tenantId (from getUser(...).tenantId or a cron loop over tenants.id) — it is
// applied as an eq('tenant_id', …) filter on every read.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { ENTITY_MAP, FILTER_OP_SET, MAX_ROWS, PROJECT_COLUMN, PROJECT_FILTER_OPS, type ReportColumnDef } from '@/lib/report-entities';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RunFilterInput {
  field?: unknown;
  op?: unknown;
  value?: unknown;
}

export interface RunReportInput {
  entity?: unknown;
  columns?: unknown;
  filters?: unknown;
  groupBy?: unknown;
  sort?: unknown;
  limit?: unknown;
}

export interface RunReportResult {
  entity: string;
  columns: ReportColumnDef[];
  groupBy: string | null;
  sort: { field: string; dir: 'asc' | 'desc' };
  rowCount: number;
  rows: Record<string, unknown>[];
}

export class ReportRunError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ReportRunError';
    this.status = status;
  }
}

/**
 * Run one whitelisted, tenant-scoped entity report.
 * Throws ReportRunError('Unknown or unsupported entity', 400) for a bad entity;
 * re-throws the underlying db error (with status 500) on a query failure.
 */
export async function runReport(
  db: SupabaseClient,
  tenantId: string,
  input: RunReportInput,
): Promise<RunReportResult> {
  const entityKey = typeof input.entity === 'string' ? input.entity : '';
  const entity = ENTITY_MAP[entityKey];
  if (!entity) {
    throw new ReportRunError('Unknown or unsupported entity', 400);
  }

  const allowed = new Map<string, ReportColumnDef>(entity.columns.map((c) => [c.key, c]));

  // ── Resolve requested columns (intersect with whitelist; fall back to all) ──
  let requested: string[] = Array.isArray(input.columns)
    ? (input.columns as unknown[]).filter((c): c is string => typeof c === 'string' && allowed.has(c))
    : [];
  if (requested.length === 0) requested = entity.columns.map((c) => c.key);

  // Always fetch id for stable row keys, even though it is not a displayable column.
  const selectSet = new Set<string>(['id', ...requested]);
  const selectClause = Array.from(selectSet).join(',');

  // Some whitelisted tables are absent from the (stale) generated Database types,
  // so the dynamic table name is accessed through a permissive client handle.
  // Identifiers are still fully validated against the whitelist above.
  let query = (db as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }).from(entity.table).select(selectClause).eq('tenant_id', tenantId);

  if (entity.soft) query = query.is('deleted_at', null);

  // ── Filters ──
  const filters: RunFilterInput[] = Array.isArray(input.filters) ? (input.filters as RunFilterInput[]) : [];
  for (const f of filters) {
    const field = typeof f.field === 'string' ? f.field : '';
    const op = typeof f.op === 'string' ? f.op : '';
    if (!allowed.has(field) || !FILTER_OP_SET.has(op)) continue; // skip anything not whitelisted
    // The Project column holds a job id: only "is / is not / empty" apply, and
    // only to a real id (anything else would be a database error, not a filter).
    if (field === PROJECT_COLUMN && (!PROJECT_FILTER_OPS.has(op) || (op !== 'is_null' && op !== 'not_null' && !UUID.test(String(f.value ?? ''))))) continue;

    if (op === 'is_null') {
      query = query.is(field, null);
      continue;
    }
    if (op === 'not_null') {
      query = query.not(field, 'is', null);
      continue;
    }

    const raw = f.value;
    if (raw === undefined || raw === null || raw === '') continue; // value-bearing ops need a value

    const colType = allowed.get(field)!.type;
    let value: unknown = raw;
    if (colType === 'number' || colType === 'currency' || colType === 'percent') {
      const n = Number(raw);
      if (Number.isNaN(n)) continue;
      value = n;
    } else if (colType === 'bool') {
      value = raw === true || raw === 'true' || raw === '1';
    } else {
      value = String(raw);
    }

    switch (op) {
      case 'eq': query = query.eq(field, value); break;
      case 'neq': query = query.neq(field, value); break;
      case 'gt': query = query.gt(field, value); break;
      case 'gte': query = query.gte(field, value); break;
      case 'lt': query = query.lt(field, value); break;
      case 'lte': query = query.lte(field, value); break;
      case 'ilike': query = query.ilike(field, `%${String(value)}%`); break;
      default: break;
    }
  }

  // ── Ordering: group-by field first (keeps groups contiguous), then sort ──
  const groupBy = typeof input.groupBy === 'string' && allowed.has(input.groupBy) ? input.groupBy : null;
  if (groupBy) query = query.order(groupBy, { ascending: true, nullsFirst: false });

  const sort = (input.sort && typeof input.sort === 'object') ? (input.sort as { field?: unknown; dir?: unknown }) : {};
  const sortField = typeof sort.field === 'string' && allowed.has(sort.field)
    ? sort.field
    : (allowed.has(entity.defaultSort) ? entity.defaultSort : requested[0]);
  const sortDir: 'asc' | 'desc' = sort.dir === 'asc' ? 'asc' : 'desc';
  if (sortField && sortField !== groupBy) {
    query = query.order(sortField, { ascending: sortDir === 'asc', nullsFirst: false });
  }

  // ── Limit (cap MAX_ROWS) ──
  let limit = Number(input.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  limit = Math.min(Math.floor(limit), MAX_ROWS);
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    // The database's words name tables and columns — log them, never return them.
    console.error('[reports/run]', entity.table, error);
    throw new ReportRunError("We couldn't run that report. Try fewer filters, or try again in a moment.", 500);
  }
  const rows = (data || []) as Record<string, unknown>[];

  // Job ids → job names (tenant-scoped), so every reader sees the job, not a uuid.
  if (requested.includes(PROJECT_COLUMN) && rows.length) {
    const ids = Array.from(new Set(rows.map((r) => r[PROJECT_COLUMN]).filter((v): v is string => typeof v === 'string' && UUID.test(v))));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: jobs, error: jobsErr } = await db.from('projects').select('id, name').eq('tenant_id', tenantId).in('id', ids);
      if (jobsErr) console.error('[reports/run] project names', jobsErr);
      for (const j of (jobs || []) as { id: string; name: string | null }[]) names.set(j.id, j.name || 'Untitled job');
    }
    for (const r of rows) {
      const id = r[PROJECT_COLUMN];
      r[PROJECT_COLUMN] = typeof id === 'string' ? names.get(id) ?? null : null;
    }
  }

  const columns = requested.map((k) => allowed.get(k)!);
  return {
    entity: entity.key,
    columns,
    groupBy,
    sort: { field: sortField, dir: sortDir },
    rowCount: rows.length,
    rows,
  };
}
