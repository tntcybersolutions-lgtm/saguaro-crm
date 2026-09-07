import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { variance, type SelectionRow } from '@/lib/selections';

export const dynamic = 'force-dynamic';

/**
 * POST /api/selections/recompute   { projectId? }
 *
 * Writes the derived variance back onto `selections.variance`.
 *
 * The two read routes derive variance and never trust the column, which is the
 * right default — but the column is real, other readers (the client portal,
 * exports, anything written later) still select it, and on live data it said 0
 * on every row including one $2,500 over its allowance. Rather than leave a
 * poisoned column behind a correct API, this brings the stored value back in
 * line with the arithmetic.
 *
 * Recomputed from source, never incremented, so running it twice changes
 * nothing the second time.
 *
 * An unpicked row is written NULL, not 0. That distinction is the whole point:
 * 0 means "picked, exactly on budget" and NULL means "nobody has chosen yet",
 * and collapsing them is what made an untouched $8,000 allowance look settled.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const projectId = typeof body.projectId === 'string' ? body.projectId : undefined;

  const g = await requirePermission(req, 'Projects', 'Edit', projectId ? { projectId } : undefined);
  if (!g.ok) return g.res;
  const { db, user } = g;

  let q = db.from('selections').select('id, allowance, selected_amount, variance').eq('tenant_id', user.tenantId);
  if (projectId) q = q.eq('project_id', projectId);

  const { data, error } = await q;
  if (error) return apiError('selections/recompute', error, 'Failed to read selections');

  const rows = (data ?? []) as (SelectionRow & { id: string })[];
  let updated = 0;
  const drift: { id: string; was: number | null; now: number | null }[] = [];

  for (const r of rows) {
    const want = variance(r);
    const was = r.variance == null ? null : Number(r.variance);
    /* Only write rows that actually disagree — a no-op UPDATE still burns a
       round trip and bumps updated_at, which makes every row look freshly
       touched every time this runs. */
    if (was === want) continue;

    const { error: uErr } = await db
      .from('selections')
      .update({ variance: want })
      .eq('id', r.id)
      .eq('tenant_id', user.tenantId);
    if (uErr) return apiError('selections/recompute', uErr, 'Failed to update selection variance');

    updated++;
    if (drift.length < 50) drift.push({ id: r.id, was, now: want });
  }

  return NextResponse.json({ success: true, examined: rows.length, updated, drift });
}
