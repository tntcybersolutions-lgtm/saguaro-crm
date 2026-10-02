/**
 * POST /api/customers/:id/email — send an email to a customer from the CRM and
 * log it on the record.
 *
 * The customer profile's "Send Email" was a mailto: link — it bounced the rep
 * out to their own mail app, sent nothing through the product, and logged
 * nothing. A salesperson could not actually email a client from the CRM, and
 * the account showed no trail of having done so. This sends through the same
 * Resend infrastructure the rest of the app uses and records it on the
 * company activity feed (entity_type 'customer'), so it also surfaces on the
 * status ticker.
 *
 * HONESTY CONTRACT (same as the leads route): lib/email sendEmail returns null
 * when RESEND_API_KEY is not configured. This route answers 503 and writes NO
 * activity in that case — a logged "Emailed the client" for a mail that never
 * left is worse than no feature.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { sendEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';

/** Minimal, deliberate escaping — the body is user-typed and goes into HTML. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;

  try {
    const db = createServerClient();

    const { data: customer, error: custErr } = await db
      .from('customer_profiles')
      .select('id, name, email')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (custErr) throw custErr;
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const subject = String((body as { subject?: unknown }).subject ?? '').trim();
    const message = String((body as { message?: unknown }).message ?? '').trim();
    const to = String((body as { to?: unknown }).to ?? (customer as { email?: string }).email ?? '').trim();

    if (!to) return NextResponse.json({ error: 'This customer has no email address' }, { status: 400 });
    if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111;">
      ${esc(message).split('\n').map((l) => `<p style="margin:0 0 12px;">${l || '&nbsp;'}</p>`).join('')}
    </div>`;

    const sent = await sendEmail({ to, subject, html, replyTo: user.email });

    if (!sent) {
      return NextResponse.json(
        { error: 'Email is not configured on this environment, so nothing was sent.' },
        { status: 503 },
      );
    }

    // True now — record it on the company feed so the account shows the trail.
    void logActivity({
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.email,
      action: 'emailed',
      entityType: 'customer',
      entityId: id,
      description: `Emailed ${(customer as { name?: string }).name || 'customer'}: ${subject}`,
      metadata: { to },
    });

    return NextResponse.json({ sent: true, id: sent.id });
  } catch (e) {
    return apiError('customers/email', e, 'Could not send that email');
  }
}
