import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiFail } from '@/lib/api-error';
import { guardProposal, normalizeLineItems, proposalTotal, PROPOSAL_COLUMNS } from '@/lib/proposal-esign';

export const runtime = 'nodejs';

/**
 * PATCH /api/proposals/[id] — edit a proposal's terms before it is signed.
 * Body: any of { title, line_items, amount, introduction, scope,
 * payment_terms, exclusions, valid_until }. A signed proposal is locked
 * (409 here, and the proposals_locked_guard trigger refuses it in the DB).
 * A link already out keeps the version it was sent with; resending sends this one.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiFail('Send a JSON body.', 400);
  try {
    const g = await guardProposal(req, id, 'Edit');
    if (!g.ok) return g.res;
    const { db, user, proposal } = g;
    if (proposal.locked_at) return apiFail('This proposal is signed. Its terms are locked.', 409);

    const t = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const patch: Record<string, unknown> = {};
    if ('title' in body) { const v = t(body.title, 200); if (!v) return apiFail('title cannot be empty.', 400); patch.title = v; }
    if ('introduction' in body) patch.introduction = t(body.introduction, 5000);
    if ('scope' in body) patch.description = t(body.scope, 20000);
    if ('payment_terms' in body) patch.payment_terms = t(body.payment_terms, 5000);
    if ('exclusions' in body) patch.exclusions = t(body.exclusions, 5000);
    if ('valid_until' in body) {
      if (body.valid_until !== null && body.valid_until !== '' && !(typeof body.valid_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.valid_until))) {
        return apiFail('valid_until must be a date (YYYY-MM-DD).', 400);
      }
      patch.valid_until = body.valid_until || null;
    }
    if ('line_items' in body || 'amount' in body) {
      const lines = 'line_items' in body ? normalizeLineItems(body.line_items) : normalizeLineItems(proposal.line_items);
      const amount = proposalTotal(lines, 'amount' in body ? body.amount : (proposal.total_amount ?? proposal.amount));
      Object.assign(patch, { line_items: lines, amount, total_amount: amount });
    }
    if (!Object.keys(patch).length) return apiFail('Nothing to change.', 400);

    const { data, error } = await db.from('proposals').update(patch)
      .eq('id', id).eq('tenant_id', user.tenantId).is('locked_at', null)
      .select(PROPOSAL_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) return apiFail('This proposal was just signed. Its terms are locked.', 409);
    const lines = normalizeLineItems((data as { line_items: unknown }).line_items);
    return NextResponse.json({ proposal: { ...data, line_items: lines, total: proposalTotal(lines, (data as { total_amount: unknown }).total_amount) } });
  } catch (e) {
    return apiError('proposals PATCH', e, 'Could not save the proposal.');
  }
}
