import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { INVOICE_STATUS_LABEL, invoiceStatus, invoiceTransition, isSubInvoiceAction } from '@/lib/sub-invoice-status';
import { postSubInvoice, type PostResult } from '@/lib/sub-invoice-posting';
import { gcSenderName } from '@/lib/sub-inbox';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/sub-portal/inbox/invoices/:id  { action: 'review'|'approve'|'reject'|'paid', note? }
 *
 * The GC moves a sub's portal invoice along (lib/sub-invoice-status). Approved
 * and paid unlock the sub's lien waiver in the portal. Sending one back needs
 * a reason, which goes to the sub as a message on the job so they know what
 * to fix. Money decisions: Pay Apps · Full.
 *
 * Approving bills the sub's subcontract and the budget line's actual cost;
 * sending back an approved invoice takes it off again; paid adds to the
 * subcontract's paid (lib/sub-invoice-posting). The answer says where it went.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Pay Apps', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Invoice id is not valid' }, { status: 400 });
    const body = (await req.json().catch(() => null)) as { action?: unknown; note?: unknown } | null;
    if (!body || !isSubInvoiceAction(body.action)) {
      return NextResponse.json({ error: 'action must be review, approve, reject or paid' }, { status: 400 });
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
    if (body.action === 'reject' && !note) {
      return NextResponse.json({ error: 'Say why it is being sent back, so the sub knows what to fix.', field: 'note' }, { status: 400 });
    }

    const db = createServerClient();
    const { data: inv, error: iErr } = await db.from('portal_sub_pay_apps').select('*')
      .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (iErr) throw iErr;
    if (!inv) return NextResponse.json({ error: 'That invoice is not one of your subs\' invoices.' }, { status: 404 });
    const row = inv as Record<string, any>;

    const step = invoiceTransition(row.status, body.action);
    if (!step.ok) return NextResponse.json({ error: step.message, invoice: row }, { status: 409 });

    // Only if nobody moved it since it was read — two people clicking at once can't double-apply.
    const now = new Date().toISOString();
    let q = db.from('portal_sub_pay_apps').update({ status: step.to, updated_at: now })
      .eq('id', id).eq('tenant_id', user.tenantId);
    q = row.status == null ? q.is('status', null) : q.eq('status', row.status);
    const { data: updated, error: uErr } = await q.select().maybeSingle();
    if (uErr) throw uErr;
    if (!updated) return NextResponse.json({ error: 'Someone else just changed this invoice. Reload to see it.' }, { status: 409 });

    // The money follows the status. If it can't be written, the status goes back
    // so the invoice and the subcontract never disagree.
    let posted: PostResult;
    try {
      posted = await postSubInvoice(db, user.tenantId, row, invoiceStatus(row.status), step.to);
    } catch (postErr) {
      const { error: undoErr } = await db.from('portal_sub_pay_apps').update({ status: row.status ?? null, updated_at: now }).eq('id', id).eq('tenant_id', user.tenantId);
      if (undoErr) console.error('[sub-portal/inbox/invoices] status undo failed', undoErr);
      return apiError('sub-portal/inbox/invoices post', postErr, "Couldn't post the invoice to the subcontract and budget, so nothing changed. Please try again.");
    }

    const who = await gcSenderName(db, user);
    const money = Number(row.net_amount ?? row.amount ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    if (body.action === 'reject' || (note && body.action !== 'review')) {
      await must(db.from('portal_sub_messages').insert({
        tenant_id: user.tenantId, project_id: row.project_id, sub_id: row.sub_id,
        sender_name: who, sender_type: 'gc',
        content: body.action === 'reject'
          ? `Your invoice for ${money} was sent back: ${note}`
          : `Your invoice for ${money} is ${INVOICE_STATUS_LABEL[step.to].toLowerCase()}. ${note}`,
      }), 'portal_sub_messages insert');
    }
    await must(db.from('portal_activity').insert({
      tenant_id: user.tenantId, project_id: row.project_id,
      action: `invoice_${step.to}`,
      description: `${who} marked the ${money} invoice ${INVOICE_STATUS_LABEL[step.to].toLowerCase()}`,
      metadata: { pay_app_id: id, from: row.status ?? null, to: step.to, note: note || null, by: user.id, commitment: posted.commitment, budget_line: posted.budgetLine },
    } as never), 'portal_activity insert');

    return NextResponse.json({ invoice: updated, posted });
  } catch (e) {
    return apiError('sub-portal/inbox/invoices', e, "Couldn't update the invoice. Please try again.");
  }
}
