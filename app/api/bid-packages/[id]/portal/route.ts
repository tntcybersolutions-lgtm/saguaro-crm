import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';
import { must } from '@/lib/db-write';
import { isBiddingStatus } from '@/lib/bid-deadline';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bid-packages/[id]/portal { enabled: boolean }
 *
 * The package's bid link switch (bid_packages.sub_portal_enabled). With it off
 * every invited bidder's link refuses to open and a reminder cannot be sent
 * (lib/bid-deadline bidRefusal: portal_off). Issuing the jacket turns it on;
 * this is the one-tap switch My Work offers when a package has bidders and the
 * link is off ("Turn on the bid link"), and the way to switch it back off.
 *
 * Turning it ON is refused for a package that is not taking bids (a draft has
 * not been issued; a closed or awarded one is over) and for one whose links
 * have expired — a switch that would still leave the link dead must say so.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== 'boolean') return apiFail('enabled must be true or false.', 400);
    const enabled = body.enabled;

    const { data: pkg, error } = await (db as any)
      .from('bid_packages')
      .select('id, status, sub_portal_enabled, sub_portal_expires_at')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!pkg) return apiFail('Bid package not found', 404);

    if (enabled) {
      const st = String(pkg.status || 'draft').toLowerCase();
      if (!isBiddingStatus(st)) {
        return apiFail(st === 'draft' || st === 'pending'
          ? 'This package has not been issued yet — issue the jacket first, which turns the link on.'
          : 'Bidding on this package is over, so its link stays off.', 409);
      }
      const exp = typeof pkg.sub_portal_expires_at === 'string' ? Date.parse(pkg.sub_portal_expires_at) : NaN;
      if (Number.isFinite(exp) && exp < Date.now()) {
        return apiFail('The bid links for this package have expired. Re-issue the jacket to send new ones.', 409);
      }
    }

    if (pkg.sub_portal_enabled === enabled) return NextResponse.json({ id, enabled, changed: false });

    const { data } = await must<{ data: Array<{ id: string; sub_portal_enabled: boolean | null }> | null; error: { message?: string } | null }>(
      (db as any).from('bid_packages')
        .update({ sub_portal_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .select('id, sub_portal_enabled'),
      'bid_packages portal switch',
    );
    if (!Array.isArray(data) || !data.length) return apiFail('Bid package not found', 404);
    return NextResponse.json({ id, enabled: data[0].sub_portal_enabled === true, changed: true });
  } catch (e) {
    return apiError('bid-packages/portal', e, "Couldn't switch the bid link. Please try again.");
  }
}
