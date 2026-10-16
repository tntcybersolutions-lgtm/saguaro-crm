import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { apiError, apiFail } from '@/lib/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/billing/plan-request { planId, interval }
 *
 * While online checkout is switched off (no Stripe key yet), "Select Plan"
 * can't open Stripe. Instead of an error, the plan is REQUESTED: nothing is
 * charged; sales sets the plan up and invoices the company. The request is
 *   • kept as a tenant_entitlements row (feature_key `plan_request:<plan>:<interval>`,
 *     status 'requested') — the same work-queue marker the add-on requests use;
 *     hasEntitlement() fails closed on it, so it never switches anything on —
 *     and it is what lets the billing screen say "Requested" after a reload;
 *   • sent to every company admin as an in-app notification;
 *   • emailed to sales (reply-to the person who asked).
 * The answer says which of those happened.
 *
 * Admin-gated, the same bar as add-on requests. This static segment wins over
 * the /api/billing/[...path] catch-all.
 */
const PLANS: Record<string, string> = { starter: 'Starter', professional: 'Professional' };
const PREFIX = 'plan_request:';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const planId = String(b.planId || '');
  const interval = b.interval === 'annual' ? 'annual' : 'monthly';
  if (!PLANS[planId]) return apiFail('planId: choose Starter or Professional (Enterprise is set up with sales).', 400);
  const planName = PLANS[planId];

  try {
    const db = createServerClient() as any;
    const nowIso = new Date().toISOString();
    const featureKey = `${PREFIX}${planId}:${interval}`;

    // One open request per company: a new choice replaces the old one.
    const { data: existing, error: readErr } = await db
      .from('tenant_entitlements')
      .select('id, feature_key, status')
      .eq('tenant_id', g.user.tenantId)
      .like('feature_key', `${PREFIX}%`);
    if (readErr) throw readErr;
    const stale = ((existing || []) as Array<{ id: string; feature_key: string }>).filter((r) => r.feature_key !== featureKey);
    if (stale.length) {
      const { error } = await db.from('tenant_entitlements').delete().eq('tenant_id', g.user.tenantId).in('id', stale.map((r) => r.id));
      if (error) throw error;
    }
    const row = {
      tenant_id: g.user.tenantId,
      feature_key: featureKey,
      status: 'requested',
      expires_at: null,
      activated_by: null,
      activated_at: null,
      meta: { request: 'plan', plan_id: planId, interval, requested_by: g.user.id, requested_by_email: g.user.email, requested_at: nowIso },
    };
    const same = ((existing || []) as Array<{ id: string; feature_key: string }>).find((r) => r.feature_key === featureKey);
    const { error: writeErr } = same
      ? await db.from('tenant_entitlements').update(row).eq('tenant_id', g.user.tenantId).eq('id', same.id)
      : await db.from('tenant_entitlements').insert(row);
    if (writeErr) throw writeErr;

    const title = `Plan requested: ${planName} (${interval})`;
    const body = `${g.user.email} asked for the ${planName} plan, billed ${interval}. Nothing has been charged — our team sets it up and emails an invoice within 1 business day.`;
    let notified = 0;
    const { data: admins, error: adminErr } = await db
      .from('profiles')
      .select('id')
      .eq('tenant_id', g.user.tenantId)
      .in('role', ['admin', 'owner']);
    if (adminErr) console.error('[billing/plan-request] admin lookup', adminErr);
    for (const a of (admins || []) as Array<{ id: string }>) {
      try { await createNotification(g.user.tenantId, a.id, 'billing', title, body, '/app/billing'); notified++; }
      catch (e) { console.error('[billing/plan-request] notify', e); }
    }

    const sent = await sendEmail({
      to: process.env.SALES_EMAIL || 'sales@saguarocontrol.net',
      replyTo: g.user.email,
      subject: `[Plan request] ${planName} (${interval}) — tenant ${g.user.tenantId}`,
      html: [
        '<h2 style="margin:0 0 12px;">Plan request</h2>',
        `<p style="margin:0 0 12px;"><strong>${planName}</strong>, billed <strong>${interval}</strong>. Online checkout is off, so nothing was charged.</p>`,
        '<table cellpadding="4" cellspacing="0" style="font-size:13px;">',
        `<tr><td>Tenant</td><td><strong>${esc(g.user.tenantId)}</strong></td></tr>`,
        `<tr><td>Requested by</td><td><strong>${esc(g.user.email || '')}</strong></td></tr>`,
        `<tr><td>Requested at</td><td>${nowIso}</td></tr>`,
        '</table>',
        '<p style="margin:12px 0 0;">Set the plan up and send the invoice within 1 business day.</p>',
      ].join('\n'),
    });

    return NextResponse.json({ ok: true, planId, interval, requestedAt: nowIso, notified, emailed: !!sent });
  } catch (e) {
    return apiError('billing/plan-request', e, "Couldn't send your plan request. Please try again, or email sales@saguarocontrol.net.");
  }
}
