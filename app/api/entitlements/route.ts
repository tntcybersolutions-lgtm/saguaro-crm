import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';

/**
 * Tenant add-on management.
 * GET  -> the caller's tenant entitlements (clients use this to badge add-ons
 *         and decide pitch-vs-product before hitting a gated route).
 * POST { featureKey, status: 'active'|'trial'|'revoked', trialDays? }
 *   Admin-only (Settings/Full): flips an add-on for the CALLER's tenant —
 *   the manual activation path after a sale. Billing automation can replace
 *   this later without touching the gate.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const db = createServerClient() as any;
    const { data } = await db
      .from('tenant_entitlements')
      .select('feature_key, status, expires_at, seats, activated_at')
      .eq('tenant_id', g.user.tenantId);
    const res = NextResponse.json({ entitlements: data || [] });
    res.headers.set('Cache-Control', 'private, max-age=60');
    return res;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  try {
    const b = await req.json().catch(() => ({}));
    const featureKey = String(b.featureKey || '');
    const status = ['active', 'trial', 'revoked'].includes(b.status) ? b.status : null;
    if (!featureKey || !status) return NextResponse.json({ error: 'featureKey and status required' }, { status: 400 });
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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
