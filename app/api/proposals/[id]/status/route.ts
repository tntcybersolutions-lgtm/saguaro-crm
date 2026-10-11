import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { acceptProposal } from '@/lib/proposal-accept';

export const runtime = 'nodejs';

/**
 * Accept / decline a proposal from the GC side (Mark Accepted / Mark Declined).
 * Recording the win/loss + firing the learner is a SEPARATE call the page makes
 * to POST /api/bids/outcome (the outcome modal).
 *
 * Accepting goes through lib/proposal-accept — the same code a client's online
 * signature runs — so the contract columns, the job's phase and the starting
 * budget are written one way, whoever accepts.
 *
 * Body: { status: 'accepted' | 'declined' }
 * Service-role client bypasses RLS → every query is explicitly tenant-scoped.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  const { user } = g;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = g.db as any;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const status =
    body.status === 'accepted' ? 'accepted' : body.status === 'declined' ? 'declined' : null;
  if (!status) {
    return NextResponse.json({ error: 'status must be "accepted" or "declined".' }, { status: 400 });
  }

  try {
    if (status === 'declined') {
      const { data, error } = await db
        .from('proposals')
        .update({ status, declined_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    const r = await acceptProposal(db, user.tenantId, id);
    if (!r.found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, contractAmount: r.amount, contractUpdated: r.contractUpdated, budgetLinesSeeded: r.budgetLinesSeeded });
  } catch (e) {
    return apiError('proposals/status', e, 'Could not update the proposal status. Please try again.');
  }
}
