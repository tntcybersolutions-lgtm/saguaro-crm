import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { addonByKey } from '@/lib/addons';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/billing/addon-request { featureKey, action?: 'enable' | 'disable' }
 *
 * HONEST add-on request flow — there is no Stripe automation for add-ons
 * (the only Stripe prices are plan prices), so this never charges anything.
 * It records the request, notifies every tenant admin, and emails support,
 * who confirm pricing and flip the entitlement within 1 business day.
 *
 * ENABLE  -> persists tenant_entitlements.status = 'requested'.
 *            Safe: the status column is plain TEXT (no CHECK constraint) and
 *            hasEntitlement() fails closed on anything except 'active'/'trial',
 *            so a 'requested' row never turns the feature on — it is purely
 *            the support work-queue marker that also survives page reloads.
 * DISABLE -> deliberately does NOT touch the row: the add-on stays ON until
 *            support processes the request. Notification + email only.
 *
 * Admin-gated (same bar as the manual entitlement flip in /api/entitlements).
 * This static segment wins over the /api/billing/[...path] catch-all.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const featureKey = String(b.featureKey || '');
    const action: 'enable' | 'disable' = b.action === 'disable' ? 'disable' : 'enable';
    const addon = addonByKey(featureKey);
    if (!addon) return NextResponse.json({ error: 'Unknown add-on' }, { status: 400 });

    const db = createServerClient() as any;
    const nowIso = new Date().toISOString();

    const { data: existing } = await db
      .from('tenant_entitlements')
      .select('id, status, expires_at')
      .eq('tenant_id', g.user.tenantId)
      .eq('feature_key', featureKey)
      .maybeSingle();
    const ex = existing as { id: string; status: string; expires_at: string | null } | null;
    const live = !!ex && (
      (ex.status === 'active' && (!ex.expires_at || new Date(ex.expires_at).getTime() > Date.now())) ||
      (ex.status === 'trial' && !!ex.expires_at && new Date(ex.expires_at).getTime() > Date.now())
    );

    if (action === 'enable' && live) {
      // Nothing to request — already on. Never downgrade a live row to 'requested'.
      return NextResponse.json({ ok: true, alreadyActive: true, featureKey });
    }

    // Persist the enable request. Best-effort: a write failure degrades to the
    // notifications-only flow instead of failing the request.
    let persisted = false;
    if (action === 'enable') {
      const row = {
        tenant_id: g.user.tenantId,
        feature_key: featureKey,
        status: 'requested',
        expires_at: null,
        activated_by: null,
        activated_at: null,
        meta: { request: 'enable', requested_by: g.user.id, requested_by_email: g.user.email, requested_at: nowIso },
      };
      try {
        if (ex) {
          const { error } = await db.from('tenant_entitlements').update(row as never).eq('tenant_id', g.user.tenantId).eq('id', ex.id);
          persisted = !error;
        } else {
          const { error } = await db.from('tenant_entitlements').insert(row as never);
          persisted = !error;
        }
      } catch {
        persisted = false;
      }
    }

    // Notify every tenant admin (profiles.role 'admin' | 'owner') in-app + push.
    const title = action === 'enable'
      ? `Add-on requested: ${addon.name}`
      : `Add-on disable requested: ${addon.name}`;
    const body = action === 'enable'
      ? `${g.user.email} requested the ${addon.name} add-on. Our team confirms pricing and enables it within 1 business day — nothing is billed without confirmation.`
      : `${g.user.email} asked to disable the ${addon.name} add-on. It stays on until our team processes the request (within 1 business day).`;
    try {
      const { data: admins } = await db
        .from('profiles')
        .select('id')
        .eq('tenant_id', g.user.tenantId)
        .in('role', ['admin', 'owner']);
      await Promise.all(((admins || []) as Array<{ id: string }>).map((a) =>
        createNotification(g.user.tenantId, a.id, 'billing', title, body, '/app/billing')
      ));
    } catch {
      // Notification failure never fails the request — support still gets the email.
    }

    // Email support. sendEmail() no-ops gracefully when RESEND_API_KEY isn't set.
    await sendEmail({
      to: process.env.SUPPORT_EMAIL || 'support@saguarocontrol.net',
      replyTo: g.user.email,
      subject: `[Add-on ${action}] ${addon.name} — tenant ${g.user.tenantId}`,
      html: [
        `<h2 style="margin:0 0 12px;">Add-on ${action} request</h2>`,
        `<p style="margin:0 0 12px;"><strong>${addon.name}</strong> (<code>${addon.key}</code>)</p>`,
        '<table cellpadding="4" cellspacing="0" style="font-size:13px;">',
        `<tr><td>Tenant</td><td><strong>${g.user.tenantId}</strong></td></tr>`,
        `<tr><td>Requested by</td><td><strong>${g.user.email}</strong></td></tr>`,
        `<tr><td>Action</td><td><strong>${action}</strong></td></tr>`,
        `<tr><td>Requested at</td><td>${nowIso}</td></tr>`,
        `<tr><td>Persisted as 'requested'</td><td>${action === 'enable' ? (persisted ? 'yes' : 'NO — notify-only, do not lose this email') : 'n/a (disable requests never touch the row)'}</td></tr>`,
        '</table>',
        `<p style="margin:12px 0 0;">Process within 1 business day. ${action === 'disable' ? 'The add-on remains ON until this is processed.' : 'Confirm pricing with the requester before activating — nothing has been billed.'}</p>`,
      ].join('\n'),
    });

    return NextResponse.json({ ok: true, featureKey, action, persisted });
  } catch (e) {
    return apiError('billing/addon-request POST', e);
  }
}
