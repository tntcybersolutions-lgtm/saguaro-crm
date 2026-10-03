import type { createServerClient } from '@/lib/supabase-server';

type Db = ReturnType<typeof createServerClient>;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * revision_date is a timestamptz. The register is about a calendar DAY (the date
 * on the title block), so every writer normalises to that day at 12:00 UTC: any
 * reader that does `new Date(value)` in a US timezone still lands on the same
 * day, instead of midnight-UTC rolling it back to yesterday.
 *
 * Accepts "2026-10-02", "2026-10-02T00:00:00+00:00", or a Date-parsable string.
 * Anything unreadable becomes null (or today when `defaultToday`), never a
 * value Postgres rejects with a 500.
 */
export function revisionDateValue(input: unknown, opts: { defaultToday?: boolean } = {}): string | null {
  const s = typeof input === 'string' ? input.trim() : '';
  let day = '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) day = m[1];
  else if (s) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) day = d.toISOString().slice(0, 10);
  }
  if (!day && opts.defaultToday) day = new Date().toISOString().slice(0, 10);
  if (!day) return null;
  const check = new Date(`${day}T12:00:00.000Z`);
  return Number.isNaN(check.getTime()) ? null : `${day}T12:00:00.000Z`;
}

/** A sheet-number-shaped token: A1, A1.0, S-201, M101. */
const SHEET_TOKEN = /^[A-Za-z]{1,2}-?\d{1,4}(?:\.\d{1,2})?$/;

/**
 * Sheet number + title for a plan file, from its name.
 *   "A-101 Floor Plan.pdf"        -> A-101 / Floor Plan
 *   "ZZ-AUDIT-Drawings-A1-A3.pdf" -> A1-A3 / ZZ AUDIT Drawings A1 A3
 *   "plans.pdf"                   -> PLANS / plans
 * Mirrors the leading-number rule in /api/drawings/upload so a sheet uploaded
 * either way files under the same number.
 */
export function sheetFromFileName(fileName: string): { sheetNumber: string; title: string } {
  const base = fileName.replace(/\.[^.]+$/, '').trim() || fileName;
  const lead = base.match(/^([A-Za-z]{1,3}[-\s]?\d{2,4}(?:\.\d{1,2})?)/);
  if (lead) {
    const sheetNumber = lead[1].toUpperCase().replace(/\s/, '-');
    const rest = base.slice(lead[1].length).replace(/^[-_\s]+/, '').replace(/[-_]+/g, ' ').trim();
    return { sheetNumber, title: rest || base };
  }
  const tokens = base.split(/[\s_-]+/).filter((t) => SHEET_TOKEN.test(t)).map((t) => t.toUpperCase());
  const title = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || base;
  if (tokens.length === 1) return { sheetNumber: tokens[0], title };
  if (tokens.length > 1) return { sheetNumber: `${tokens[0]}-${tokens[tokens.length - 1]}`, title };
  return { sheetNumber: base.toUpperCase().slice(0, 24), title };
}

export interface PlanSource {
  path: string;
  name: string;
  type?: string;
}

/**
 * Register the plan files a takeoff was run on in the project's Drawing
 * Register, so the set the estimate was built from is the set the field sees.
 *
 * One drawing per SOURCE FILE, referencing the object already in storage (no
 * copy). Idempotent per file: the drawing's url is the source object's stored
 * URL, and a file that already has a drawing row — including one the GC has
 * since edited or deleted (soft-deleted rows count) — is left alone, so a
 * re-upload or a second merge never duplicates or resurrects a sheet.
 *
 * Never throws: the takeoff upload must not fail because the register write
 * did. Failures are logged and returned so the caller can report them.
 */
export async function registerTakeoffPlanDrawings(
  db: Db,
  args: {
    tenantId: string;
    projectId: string | null | undefined;
    bucket: string;
    sources: PlanSource[];
    takeoffName?: string | null;
  },
): Promise<{ created: number; existing: number; error?: string }> {
  const { tenantId, projectId, bucket, sources, takeoffName } = args;
  if (!projectId || !sources.length) return { created: 0, existing: 0 };
  try {
    const withUrls = sources.map((s) => ({
      ...s,
      url: db.storage.from(bucket).getPublicUrl(s.path).data.publicUrl as string,
    }));
    const { data: already, error: readErr } = await (db as any)
      .from('drawings')
      .select('url')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .in('url', withUrls.map((s) => s.url));
    if (readErr) throw readErr;
    const have = new Set(((already || []) as { url: string }[]).map((r) => r.url));
    const today = revisionDateValue(null, { defaultToday: true });
    const rows = withUrls
      .filter((s) => !have.has(s.url))
      .map((s) => {
        const { sheetNumber, title } = sheetFromFileName(s.name || 'Plan set');
        return {
          tenant_id: tenantId,
          project_id: projectId,
          name: title,
          url: s.url,
          sheet_number: sheetNumber,
          discipline: 'Architectural',
          status: 'current',
          revision_date: today,
          notes: takeoffName
            ? `Plan set uploaded for AI takeoff "${takeoffName}" (${s.name}).`
            : `Plan set uploaded for AI takeoff (${s.name}).`,
        };
      });
    if (rows.length) {
      const { error: insErr } = await (db as any).from('drawings').insert(rows);
      if (insErr) throw insErr;
    }
    return { created: rows.length, existing: withUrls.length - rows.length };
  } catch (e: unknown) {
    console.error('[drawing-register] could not register takeoff plan set:', e);
    return { created: 0, existing: 0, error: 'register-failed' };
  }
}
