import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { retainageLedger } from '@/lib/retainage';
import { transitionPayAppStatus } from '@/lib/pay-app-status';
import { isCoToken, ownerView, ownerDecision } from '@/lib/change-order-stages';

/* The owner's review link. The token IS the credential, the same way the
   signing portal works: owner_approval_token is unguessable and identifies
   exactly one pay app, so the tenant comes from that row, never the request.

   Only the figures the owner's G702/G703 review shows leave this route — the
   pay app's internal notes, overhead and markup never do. */
const PA_COLS = [
  'id', 'tenant_id', 'project_id', 'app_number', 'status', 'deleted_at',
  'period_from', 'period_to', 'contract_sum', 'change_orders_total', 'contract_sum_to_date',
  'prev_completed', 'this_period', 'stored_materials', 'total_completed', 'total_completed_stored',
  'retainage_percent', 'total_retainage', 'retainage_amount', 'total_earned_less_retainage',
  'less_previous_certificates', 'prev_payments', 'current_payment_due',
  'g702_pdf_url', 'g703_pdf_url', 'submitted_at', 'approved_at', 'certified_at', 'payment_received_at',
  'rejected_at', 'rejection_reason', 'approval_notes',
].join(', ');

type PaRow = Record<string, any>;

/** Where the review stands: open for a decision, or decided (and when). */
function reviewState(pa: PaRow): { open: boolean; decision: 'approved' | 'rejected' | 'withdrawn' | null; decidedAt: string | null } {
  const s = String(pa.status || '').toLowerCase();
  if (s === 'submitted') return { open: true, decision: null, decidedAt: null };
  if (s === 'approved' || s === 'certified' || s === 'paid') {
    return { open: false, decision: 'approved', decidedAt: pa.approved_at || pa.certified_at || pa.payment_received_at || null };
  }
  if (s === 'rejected') return { open: false, decision: 'rejected', decidedAt: pa.rejected_at || null };
  // Draft: the contractor pulled it back before a decision.
  return { open: false, decision: 'withdrawn', decidedAt: null };
}

async function loadByToken(db: ReturnType<typeof createServerClient>, token: string): Promise<PaRow | null> {
  const { data, error } = await db.from('pay_applications').select(PA_COLS).eq('owner_approval_token', token).maybeSingle();
  if (error) throw error;
  const pa = data as PaRow | null;
  if (!pa || pa.deleted_at) return null;
  return pa;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const db = createServerClient();
    /* A change order request sent to the owner (lib/change-order-stages):
       its token carries a prefix, and the tenant comes from that row. */
    if (isCoToken(token)) {
      const view = await ownerView(db, token);
      if (!view) return NextResponse.json({ error: 'This approval link is not valid. Ask your contractor to send it again.' }, { status: 404 });
      return NextResponse.json(view);
    }
    const pa = await loadByToken(db, token);
    if (!pa) return NextResponse.json({ error: 'This approval link is not valid. Ask your contractor to send it again.' }, { status: 404 });

    const tenantId = String(pa.tenant_id);
    // schedule_of_values.pay_app_id has no FK, so these are separate reads.
    const [projectRes, sovRes, siblingsRes] = await Promise.all([
      pa.project_id
        ? db.from('projects').select('id, name, address').eq('id', pa.project_id).eq('tenant_id', tenantId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from('schedule_of_values')
        .select('line_number, description, scheduled_value, prev_completed, this_period, stored_materials, total_completed, percent_complete, balance_to_finish')
        .eq('pay_app_id', pa.id).eq('tenant_id', tenantId).order('line_number', { ascending: true }),
      /* The owner sees the same G702 line 7 and retainage released as the GC
         (lib/retainage), not the unfilled prev_payments text column. */
      pa.project_id
        ? db.from('pay_applications')
            .select('id, app_number, total_retainage, retainage_amount, total_earned_less_retainage, less_previous_certificates, deleted_at')
            .eq('tenant_id', tenantId).eq('project_id', pa.project_id)
        : Promise.resolve({ data: [pa], error: null }),
    ]);
    if (projectRes.error) throw projectRes.error;
    if (sovRes.error) throw sovRes.error;
    if (siblingsRes.error) throw siblingsRes.error;

    // Only the review columns, named here, leave the server.
    const publicPa = Object.fromEntries(
      PA_COLS.split(', ').filter((c) => c !== 'tenant_id' && c !== 'deleted_at').map((c) => [c, pa[c] ?? null]),
    );
    return NextResponse.json({
      payApp: publicPa,
      project: projectRes.data || null,
      lineItems: sovRes.data || [],
      retainage: retainageLedger((siblingsRes.data || []) as any[], String(pa.id)),
      review: reviewState(pa),
    });
  } catch (e) {
    return apiError('owner-portal/approve GET', e, "Couldn't load this pay application. Please try again.");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const body = (await req.json().catch(() => null)) as { action?: unknown; note?: unknown; name?: unknown } | null;
    const action = body?.action === 'approved' ? 'approved' : body?.action === 'rejected' ? 'rejected' : null;
    if (!action) return NextResponse.json({ error: 'Choose approve or return for revision.' }, { status: 400 });
    const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 4000) : null;

    const db = createServerClient();
    if (isCoToken(token)) {
      /* The owner's signature on a change order request: it books the change
         through the one shared step once the company's approvers are done. */
      const name = typeof (body as { name?: unknown } | null)?.name === 'string' ? String((body as { name?: string }).name).trim().slice(0, 200) : null;
      const r = await ownerDecision(db, token, action, { note, name });
      if (!r.ok) return NextResponse.json({ error: r.error, review: r.review }, { status: r.status });
      return NextResponse.json({ success: true, review: r.review });
    }
    const pa = await loadByToken(db, token);
    if (!pa) return NextResponse.json({ error: 'This approval link is not valid. Ask your contractor to send it again.' }, { status: 404 });

    // A decision is taken once, while the application is with the owner.
    // Resubmitting after a return reopens it.
    const review = reviewState(pa);
    if (!review.open) {
      return NextResponse.json({ error: 'This pay application has already been reviewed.', review }, { status: 409 });
    }

    /* Owner approval is the normal flow, so it runs through the same
       transition as the GC's Approve: approved_at, approval notes and the
       conditional lien-waiver cascade. A return goes back to the GC with the
       owner's reason. */
    const r = await transitionPayAppStatus(db, String(pa.tenant_id), String(pa.id), action, { note });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, review: reviewState(r.payApp as PaRow) });
  } catch (e) {
    return apiError('owner-portal/approve/[token] POST', e);
  }
}
