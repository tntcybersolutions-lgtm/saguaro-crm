/**
 * Embedding a parent row (e.g. `projects(name)`) from a table that has TWO
 * foreign keys to that parent.
 *
 * These tables carry the default `<table>_<col>_fkey` constraint and a second,
 * identical `fk_<table>_<parent>` one (verified on the live schema, pg_constraint,
 * 2026-10-10). With two relationships PostgREST can't choose, answers HTTP 300
 * ("more than one relationship was found"), and supabase-js returns that as an
 * error — so `rfis.select('*, projects(name)')` failed on every call, and the RFI
 * detail route, the dashboard's overdue RFIs, the RFI and change-order reports
 * and Sage reports all failed. Naming the constraint removes the doubt.
 *
 * Always the `*_fkey` one: if the duplicate `fk_*` constraints are ever dropped,
 * these keep working. Add a table here (and use `embed()`) when pg_constraint
 * shows another pair:
 *   SELECT conrelid::regclass, confrelid::regclass, array_agg(conname)
 *   FROM pg_constraint WHERE contype='f' GROUP BY conrelid, confrelid
 *   HAVING count(*) > 1 AND count(DISTINCT conkey) < count(*);   -- same columns twice
 */
const DUPLICATE_FK: Record<string, Record<string, string>> = {
  rfis: { projects: 'rfis_project_id_fkey' },
  change_orders: { projects: 'change_orders_project_id_fkey' },
  daily_logs: { projects: 'daily_logs_project_id_fkey' },
  photos: { projects: 'photos_project_id_fkey' },
  punch_list: { projects: 'punch_list_project_id_fkey' },
  timesheets: { projects: 'timesheets_project_id_fkey' },
  equipment_log: { projects: 'equipment_log_project_id_fkey' },
  messages: { projects: 'messages_project_id_fkey' },
  safety_incidents: { projects: 'safety_incidents_project_id_fkey' },
  inspections: { projects: 'inspections_project_id_fkey' },
  deliveries: { projects: 'deliveries_project_id_fkey' },
  contacts: { projects: 'contacts_project_id_fkey' },
  clock_punches: { projects: 'clock_punches_project_id_fkey' },
  drawings: { projects: 'drawings_project_id_fkey' },
  schedule_tasks: { projects: 'schedule_tasks_project_id_fkey' },
  takeoff_materials: { takeoffs: 'takeoff_materials_takeoff_id_fkey' },
};

/** The constraint to embed through between two tables, either direction, or null when there is only one. */
function constraintFor(from: string, to: string): string | null {
  return DUPLICATE_FK[from]?.[to] ?? DUPLICATE_FK[to]?.[from] ?? null;
}

/** `embed('rfis', 'projects')` → `projects!rfis_project_id_fkey`; any other pair → the table name. */
export function embed(from: string, to: string): string {
  const fk = constraintFor(from, to);
  return fk ? `${to}!${fk}` : to;
}

/**
 * Rewrite the top-level embeds in a select string that would be ambiguous
 * from `table` — for selects that come from elsewhere (Sage's report plans).
 * `rfis`, `id,subject,projects(name)` → `id,subject,projects!rfis_project_id_fkey(name)`.
 * An embed that already names its relationship (`projects!…(`) is left alone.
 */
export function qualifyEmbeds(table: string, select: string): string {
  // Only the embeds at the top level hang off `table`; nested ones belong to their own parent.
  let depth = 0;
  let out = '';
  let i = 0;
  while (i < select.length) {
    const c = select[i];
    if (c === ')') { depth = Math.max(0, depth - 1); out += c; i++; continue; }
    if (c === '(') { depth++; out += c; i++; continue; }
    const m = depth === 0 && (i === 0 || /[,\s]/.test(select[i - 1]))
      ? /^((?:[a-z_][a-z0-9_]*:)?)([a-z_][a-z0-9_]*)\s*\(/i.exec(select.slice(i))
      : null;
    const fk = m ? constraintFor(table, m[2]) : null;
    if (m && fk) {
      out += `${m[1]}${m[2]}!${fk}(`;
      i += m[0].length;
      depth++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
