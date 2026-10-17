import { NextRequest, NextResponse } from 'next/server';
import { hasPermission, requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { normalizeTiers, validateTiers, SUGGESTED_TIERS, DEFAULT_TIERS } from '@/lib/change-order-tiers';

export const dynamic = 'force-dynamic';

/**
 * Change order approval tiers — tenant_settings.co_approval_tiers.
 *
 *   GET → { tiers, isSet, suggested, canEdit }   anyone with Change Orders: View
 *   PUT { tiers } → { tiers }                    Admin: Full only
 *
 * The tiers are enforced on the server, in the shared approve step
 * (lib/change-order-status), for every screen that approves a change order.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Change Orders', 'View');
  if (!g.ok) return g.res;
  try {
    const db = g.db;
    const { data, error } = await db.from('tenant_settings').select('co_approval_tiers').eq('tenant_id', g.user.tenantId).maybeSingle();
    if (error) throw error;
    const raw = (data as { co_approval_tiers?: unknown } | null)?.co_approval_tiers ?? null;
    return NextResponse.json(
      { tiers: normalizeTiers(raw), isSet: raw !== null, suggested: SUGGESTED_TIERS, defaults: DEFAULT_TIERS, canEdit: hasPermission(g.perms, 'Admin', 'Full') },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return apiError('settings/co-approval-tiers GET', e, "Couldn't read your approval tiers.");
  }
}

export async function PUT(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const body = (await req.json().catch(() => null)) as { tiers?: unknown } | null;
  const v = validateTiers(body?.tiers);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const db = g.db;
    const now = new Date().toISOString();
    const { data: existing, error: rErr } = await db.from('tenant_settings').select('id').eq('tenant_id', g.user.tenantId).maybeSingle();
    if (rErr) throw rErr;
    const { error } = existing
      ? await db.from('tenant_settings').update({ co_approval_tiers: v.tiers as never, updated_at: now }).eq('tenant_id', g.user.tenantId)
      : await db.from('tenant_settings').insert({ tenant_id: g.user.tenantId, co_approval_tiers: v.tiers as never });
    if (error) throw error;
    return NextResponse.json({ tiers: v.tiers, isSet: true });
  } catch (e) {
    return apiError('settings/co-approval-tiers PUT', e, "Couldn't save your approval tiers.");
  }
}

