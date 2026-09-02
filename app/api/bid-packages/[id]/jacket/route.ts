import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { assembleJacket } from '@/lib/bid-jacket';

/**
 * GET /api/bid-packages/[id]/jacket — the GC's view of a jacket's contents.
 *
 * A bid jacket used to be one generated PDF: an AI scope narrative flattened
 * into a file. That is a document ABOUT the package, not the package — a sub
 * who opened it still had to go and find the drawings, the specs, the bid form
 * and the insurance requirements somewhere else. The Documents list showed
 * twenty-eight rows all called "Bid Jacket" with nothing to tell them apart.
 *
 * The assembly itself lives in lib/bid-jacket so the bidder's portal view is
 * the same jacket rather than a second copy that drifts. Only URL resolution
 * differs: this route hands back /api/files/open links, which require a signed-in
 * caller; the portal signs real URLs because a bidder has no session.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const db = createServerClient();

    const { data: pkg } = await db
      .from('bid_packages')
      .select('*, projects(*)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const jacket = await assembleJacket(db, {
      packageId: id,
      tenantId: user.tenantId,
      pkg: pkg as Record<string, any>,
      /* Private buckets hand out expiring links, so documents open through the
         signing proxy rather than by their stored URL. */
      resolveUrl: (u) => (u ? `/api/files/open?u=${encodeURIComponent(u)}` : null),
    });

    return NextResponse.json(jacket);
  } catch (e) {
    return apiError('bid_jacket', e);
  }
}
