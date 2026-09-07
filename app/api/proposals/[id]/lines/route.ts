import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * GET / PUT /api/proposals/[id]/lines
 *
 * The line-item breakdown behind one proposal.
 *
 * `proposal_lines` carries no tenant_id — it is scoped through its parent — so
 * every request here loads the proposal first and checks the tenant on that.
 * Reading the lines by proposal_id alone would hand any signed-in user the
 * priced breakdown of any tenant's proposal if they guessed an id.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Documents', 'View');
  if (!g.ok) return g.res;
  const { db, user } = g;

  const { data: proposal, error: pErr } = await db
    .from('proposals').select('id, project_id, total_amount, amount')
    .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
  if (pErr) return apiError('proposals/lines', pErr, 'Failed to load the proposal');
  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  const { data, error } = await db
    .from('proposal_lines').select('*')
    .eq('proposal_id', id)
    .order('sort_order', { ascending: true });
  if (error) return apiError('proposals/lines', error, 'Failed to load the proposal lines');

  const lines = data ?? [];
  const base = lines.filter((l) => !l.is_optional).reduce((s, l) => s + (Number(l.total_price) || 0), 0);
  const optional = lines.filter((l) => l.is_optional).reduce((s, l) => s + (Number(l.total_price) || 0), 0);
  const header = Number(proposal.total_amount ?? proposal.amount) || 0;

  return NextResponse.json({
    lines,
    lineTotal: Math.round(base * 100) / 100,
    optionalTotal: Math.round(optional * 100) / 100,
    headerAmount: header,
    /* The header amount and the lines are entered independently, and on live
       data they disagreed by $303,200 on one proposal and $51,600 on another —
       invisible for as long as nothing read this table. The difference is
       reported rather than hidden, or silently "corrected", because only the
       estimator knows which number is the right one. */
    reconciles: lines.length === 0 || Math.abs(header - base) < 0.01,
    difference: lines.length === 0 ? 0 : Math.round((header - base) * 100) / 100,
  });
}

/**
 * PUT — replace the breakdown for one proposal.
 *
 * Body: { lines: [{ description, quantity?, unit?, unit_price?, total_price, is_optional?, notes? }],
 *         syncHeader?: boolean }
 *
 * Replace rather than merge: the breakdown is one document, and a partial
 * update that leaves an old row behind puts a line on a client's proposal that
 * nobody meant to send. `syncHeader` pulls the proposal's amount up to the sum
 * of the base lines, which is the usual intent after editing them.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const { db, user } = g;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (!Array.isArray(body.lines)) {
    return NextResponse.json({ error: 'lines[] is required' }, { status: 400 });
  }

  const { data: proposal, error: pErr } = await db
    .from('proposals').select('id').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
  if (pErr) return apiError('proposals/lines', pErr, 'Failed to load the proposal');
  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };

  const rows = (body.lines as Record<string, unknown>[]).map((l, i) => ({
    proposal_id: id,
    sort_order: Number.isFinite(Number(l.sort_order)) ? Number(l.sort_order) : i,
    /* description is NOT NULL. A blank one would fail the insert after the
       delete below had already emptied the table. */
    description: String(l.description ?? '').trim() || 'Untitled item',
    quantity: num(l.quantity),
    unit: l.unit ? String(l.unit) : null,
    unit_price: num(l.unit_price),
    total_price: num(l.total_price) ?? 0,
    is_optional: l.is_optional === true,
    notes: l.notes ? String(l.notes) : null,
  }));

  const { error: dErr } = await db.from('proposal_lines').delete().eq('proposal_id', id);
  if (dErr) return apiError('proposals/lines', dErr, 'Failed to replace the proposal lines');

  let saved: unknown[] = [];
  if (rows.length) {
    const { data, error } = await db
      .from('proposal_lines')
      .insert(rows as Database['public']['Tables']['proposal_lines']['Insert'][])
      .select();
    if (error) return apiError('proposals/lines', error, 'Failed to save the proposal lines');
    saved = data ?? [];
  }

  const base = rows.filter((r) => !r.is_optional).reduce((s, r) => s + r.total_price, 0);
  if (body.syncHeader === true) {
    const total = Math.round(base * 100) / 100;
    const { error: uErr } = await db
      .from('proposals').update({ amount: total, total_amount: total })
      .eq('id', id).eq('tenant_id', user.tenantId);
    if (uErr) return apiError('proposals/lines', uErr, 'Failed to update the proposal total');
  }

  return NextResponse.json({ success: true, lines: saved, lineTotal: Math.round(base * 100) / 100 });
}
