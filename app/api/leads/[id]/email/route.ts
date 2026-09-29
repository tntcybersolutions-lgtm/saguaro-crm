/**
 * POST /api/leads/:id/email — send an email to a lead and log it on the deal.
 *
 * The email infrastructure has existed for a long time and is used by pay-app
 * notifications, lien waivers, W-9 requests, file shares, scheduled reports and
 * the sub portal. Nothing in the sales side ever called it, so a salesperson
 * could record that they had emailed somebody but could not actually email
 * them from the product.
 *
 * HONESTY CONTRACT: lib/email sendEmail returns null when RESEND_API_KEY is not
 * configured — it logs and no-ops. This route therefore checks the result and
 * answers 503 with an explicit message rather than reporting success, and it
 * does NOT write an activity in that case. A logged "Emailed the client" for a
 * mail that never left would be worse than no feature at all: the deal would
 * look worked when nobody had been contacted.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { sendEmail } from '@/lib/email';

/** Minimal, deliberate escaping: the body is typed by a user and goes into
 *  HTML. Never interpolate it raw. */
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

    // The lead must belong to the caller's tenant. Read it first and alone:
    // everything after this depends on that ownership being established.
    const { data: lead, error: leadErr } = await db
      .from('lead_pipeline')
      .select('id, company_name, contact_name, email')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (leadErr) throw leadErr;
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const subject = String((body as any).subject ?? '').trim();
    const message = String((body as any).message ?? '').trim();
    const to = String((body as any).to ?? lead.email ?? '').trim();

    if (!to) return NextResponse.json({ error: 'This lead has no email address' }, { status: 400 });
    if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111;">
      ${esc(message).split('\n').map((l) => `<p style="margin:0 0 12px;">${l || '&nbsp;'}</p>`).join('')}
    </div>`;

    const sent = await sendEmail({ to, subject, html, replyTo: user.email });

    if (!sent) {
      // Not configured, or the provider refused. Say so; write nothing.
      return NextResponse.json(
        { error: 'Email is not configured on this environment, so nothing was sent.' },
        { status: 503 },
      );
    }

    // Only now is it true. Log it on the deal so the trail is complete.
    const { error: actErr } = await db.from('lead_activities').insert({
      tenant_id: user.tenantId,
      lead_id: id,
      activity_type: 'email',
      description: subject,
      outcome: `Sent to ${to}`,
      completed_at: new Date().toISOString(),
      created_by: user.id,
    } as never);
    // The mail is already gone; failing the request now would invite a resend
    // and a duplicate. Report the send, flag the log.
    if (actErr) console.error('[leads/email] activity log', actErr);

    await db
      .from('lead_pipeline')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .then(() => {}, () => {});

    return NextResponse.json({ sent: true, id: sent.id, logged: !actErr });
  } catch (e) {
    return apiError('leads/email', e, 'Could not send that email');
  }
}
