import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { isPlatformAdmin } from '@/lib/platform-admin';

/**
 * Tenant add-on management.
 * GET  -> the caller's tenant entitlements (clients use this to badge add-ons
 *         and decide pitch-vs-product before hitting a gated route).
 * POST { featureKey, status: 'active'|'trial'|'revoked', trialDays? }
 *   Admin: Full, for the CALLER's tenant. 'active' / 'trial' (the manual
 *   activation after a sale) additionally require a platform owner; a
 *   company admin may only 'revoke'.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const db = createServerClient() as any;
    const { data, error } = await db
      .from('tenant_entitlements')
      .select('feature_key, status, expires_at, seats, activated_at')
      .eq('tenant_id', g.user.tenantId);
    if (error) throw error;
    const res = NextResponse.json({ entitlements: data || [] });
    res.headers.set('Cache-Control', 'private, max-age=60');
    return res;
  } catch (e) {
    return apiError('entitlements GET', e);
  }
}

export async function POST(req: NextRequest) {
  /* Switching a paid feature on or off for the company is an account change.
     It was gated on Projects: Full — which the built-in Salesperson and
     Project Manager roles both hold — so either could turn on add-ons the
     company had not bought. The add-on and plan request routes already
     describe themselves as "the same bar as /api/entitlements": Admin. */
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const b = await req.json().catch(() => ({}));
    const featureKey = String(b.featureKey || '');
    const status = ['active', 'trial', 'revoked'].includes(b.status) ? b.status : null;
    if (!featureKey || !status) return NextResponse.json({ error: 'featureKey and status required' }, { status: 400 });
    /* Turning a paid add-on ON is a sale, not a setting. Add-ons have no
       Stripe price (lib/addons; /api/billing/addon-request), so nothing here
       can prove a payment — and a company admin could switch on any add-on
       for free. Only the platform owners (PLATFORM_ADMIN_EMAILS), who
       activate add-ons after a sale, may set 'active' or 'trial'. A company
       admin may still switch their own add-on OFF; anything already enabled
       stays enabled — this changes who may write, not what is stored. */
    if (status !== 'revoked' && !isPlatformAdmin(g.user.email)) {
      return NextResponse.json({
        error: 'Add-ons are switched on by Saguaro after purchase. Request it from Billing and we will turn it on.',
        requestVia: '/api/billing/addon-request',
      }, { status: 403 });
    }
    const db = createServerClient() as any;
    const expires_at = status === 'trial'
      ? new Date(Date.now() + Math.max(1, Math.min(90, Number(b.trialDays) || 14)) * 86400000).toISOString()
      : null;
    const row = {
      tenant_id: g.user.tenantId, feature_key: featureKey, status,
      expires_at, activated_by: g.user.id, activated_at: new Date().toISOString(),
    };
    const { data: existing } = await db.from('tenant_entitlements').select('id').eq('tenant_id', g.user.tenantId).eq('feature_key', featureKey).maybeSingle();
    if (existing) await must(db.from('tenant_entitlements').update(row as never).eq('id', (existing as any).id), 'tenant_entitlements update');
    else await must(db.from('tenant_entitlements').insert(row as never), 'tenant_entitlements insert');
    return NextResponse.json({ ok: true, featureKey, status, expires_at });
  } catch (e) {
    return apiError('entitlements POST', e);
  }
}
