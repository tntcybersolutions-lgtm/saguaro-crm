import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import type { Database } from '@/lib/database.types';
import { reconcile, UNALLOCATED_LINE_LABEL } from '@/lib/proposal-build';

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
  /* Reconciliation lives in lib/proposal-build so the arithmetic that reports a
     mismatch and the arithmetic that fixes it are literally the same function. */
  const r = reconcile(proposal.total_amount ?? proposal.amount, lines);

  return NextResponse.json({
    lines,
    lineTotal: r.baseTotal,
    optionalTotal: r.optionalTotal,
    headerAmount: r.headerAmount,
    reconciles: r.reconciles,
    difference: lines.length === 0 ? 0 : r.difference,
    remedy: r.remedy,
    suggestedLabel: UNALLOCATED_LINE_LABEL,
  });
}

/**
 * PATCH — close the gap between the stated amount and the lines.
 *
 * Two remedies, and which one applies is decided by the sign of the difference
 * rather than by the caller:
 *
 *   add-line     the lines account for less than the proposal states. The
 *                missing money is real — general conditions, overhead and
 *                profit that were itemised nowhere — so it becomes a line. The
 *                contract price does not move, because that is the number the
 *                client agreed to.
 *
 *   sync-header  the lines already total more than the proposal states. There
 *                is nothing to add; the header is the figure that is wrong.
 *
 * Deliberately not automatic. A proposal quietly rewriting its own total is how
 * a number nobody chose ends up on a signed document.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const { db, user } = g;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const { data: proposal, error: pErr } = await db
    .from('proposals').select('id, total_amount, amount')
    .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
  if (pErr) return apiError('proposals/lines', pErr, 'Failed to load the proposal');
  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  const { data: lines, error: lErr } = await db
    .from('proposal_lines').select('*').eq('proposal_id', id).order('sort_order', { ascending: true });
  if (lErr) return apiError('proposals/lines', lErr, 'Failed to load the proposal lines');

  const r = reconcile(proposal.total_amount ?? proposal.amount, lines ?? []);
  if (r.reconciles) {
    return NextResponse.json({ success: true, alreadyReconciled: true, ...r });
  }

  const mode = body.mode === 'sync-header' || body.mode === 'add-line' ? body.mode : r.remedy;

  if (mode === 'add-line') {
    if (r.difference <= 0) {
      return NextResponse.json(
        { error: 'The lines already total more than this proposal states — adding a line would widen the gap.' },
        { status: 409 },
      );
    }
    const nextSort = (lines ?? []).reduce((mx, l) => Math.max(mx, Number(l.sort_order) || 0), 0) + 1;
    const { error } = await db.from('proposal_lines').insert({
      proposal_id: id,
      sort_order: nextSort,
      description: (typeof body.description === 'string' && body.description.trim()) || UNALLOCATED_LINE_LABEL,
      quantity: null, unit: null, unit_price: null,
      total_price: r.difference,
      is_optional: false,
      notes: null,
    } as Database['public']['Tables']['proposal_lines']['Insert']);
    if (error) return apiError('proposals/lines', error, 'Failed to add the reconciling line');
  } else {
    const total = r.baseTotal;
    const { error } = await db
      .from('proposals').update({ amount: total, total_amount: total })
      .eq('id', id).eq('tenant_id', user.tenantId);
    if (error) return apiError('proposals/lines', error, 'Failed to update the proposal total');
  }

  /* Re-read rather than predict: the answer returned is the state on disk. */
  const { data: after } = await db
    .from('proposal_lines').select('*').eq('proposal_id', id).order('sort_order', { ascending: true });
  const { data: p2 } = await db
    .from('proposals').select('total_amount, amount').eq('id', id).eq('tenant_id', user.tenantId).single();

  return NextResponse.json({ success: true, mode, lines: after ?? [], ...reconcile(p2?.total_amount ?? p2?.amount, after ?? []) });
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
