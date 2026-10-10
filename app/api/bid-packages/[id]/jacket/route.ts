import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { assembleJacket, diffAgainstManifest } from '@/lib/bid-jacket';

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

    const { data: pkg, error: pkgErr } = await db
      .from('bid_packages')
      .select('*, projects(*)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    /* A failed read is an error, not "this package does not exist" — a 404
       here sent the GC back to the list for what was really an outage. */
    if (pkgErr) throw pkgErr;
    if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const p = pkg as Record<string, any>;

    const jacket = await assembleJacket(db, {
      packageId: id,
      tenantId: user.tenantId,
      pkg: p,
      // The GC's own view carries the whole conversation; bidders never get it.
      includeCorrespondence: true,
      /* Private buckets hand out expiring links, so documents open through the
         signing proxy rather than by their stored URL. */
      resolveUrl: (u) => (u ? `/api/files/open?u=${encodeURIComponent(u)}` : null),
    });

    /* What has changed since this jacket was issued. The GC's view is live, so
       a drawing revised after the invitations went out silently changes what
       every bidder is pricing — with no addendum, and no record of what was
       actually sent. Comparing live against the issued manifest turns that from
       something nobody notices into "3 drawings revised — send an addendum". */
    const drift = diffAgainstManifest(jacket, p.jacket_sections);

    return NextResponse.json({
      ...jacket,
      issued: p.jacket_generated_at
        ? {
            at: p.jacket_generated_at,
            version: p.jacket_version ?? 1,
            invited: p.num_invited ?? 0,
            addenda: p.addendum_count ?? 0,
          }
        : null,
      drift,
    });
  } catch (e) {
    return apiError('bid_jacket', e);
  }
}
