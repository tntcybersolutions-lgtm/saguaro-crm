import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signUrl } from '@/lib/storage-signing';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { tryWrite } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { assembleJacket, forBidder } from '@/lib/bid-jacket';
import { bidRefusal, deadlineZone } from '@/lib/bid-deadline';

/**
 * GET /api/bid-packages/portal/[token] — the bidder's jacket.
 *
 * Public by design: the opaque per-invite token IS the capability, the same
 * pattern as the prequalification and owner-approval portals. A subcontractor
 * has no account, so requiring one would mean no bid could ever be submitted —
 * which, until now, was exactly the situation. Every bid invitation the product
 * has ever sent linked to /portals/sub/<token>, a path with no page behind it
 * whose auth route validates a different token type entirely.
 *
 * Tenant isolation without a session:
 *   1. tenantId comes from the invite row, never from the caller.
 *   2. The package's tenant is cross-checked against the invite's. Even if the
 *      GC-side invite writer regressed and stamped the wrong tenant, this would
 *      refuse to serve rather than hand one tenant's drawings to another's sub.
 *   3. Every downstream query carries that tenant id.
 *
 * Documents are signed here rather than proxied: /api/files/open calls getUser
 * and would 401, giving the bidder a jacket where every drawing is a dead link.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  /* Unauthenticated and enumerable by definition, so it is rate limited by IP.
     bid_package_invites.token has no index yet; that is worth adding before
     this sees real traffic. */
  const { allowed, resetIn } = checkRateLimit(`bid-jacket:${getClientIP(req)}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) } },
    );
  }

  if (!token) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });

  try {
    const db = createServerClient();

    const { data: invite } = await db
      .from('bid_package_invites')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    /* One message for "no such token" and "revoked": a distinct response would
       tell someone probing tokens which ones exist. */
    if (!invite) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    const inv = invite as Record<string, any>;
    if (['revoked', 'withdrawn'].includes(String(inv.status || ''))) {
      return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    }

    const tenantId = inv.tenant_id as string;

    const { data: pkg } = await db
      .from('bid_packages')
      .select('*, projects(*)')
      .eq('id', inv.bid_package_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });

    const p = pkg as Record<string, any>;

    /* Belt and braces: the invite and the package must agree on the tenant. */
    if (p.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    }

    if (p.sub_portal_enabled === false) {
      return NextResponse.json({ error: 'This bid package is no longer accepting access.' }, { status: 404 });
    }

    /* A DRAFT IS NOT SOMETHING A SUBCONTRACTOR SHOULD BE READING. Adding subs
       mints their tokens; /issue is what sends the jacket. Between those two
       the scope is still being assembled, and this route let an invited sub
       open it and price from an unfinished set — which is how the lifecycle
       walk found two subs bidding on a jacket /issue had refused to send for
       missing Drawings, Specifications and a Bid Form.

       Only draft is blocked. A closed or awarded package stays readable on
       purpose: a sub who bid should be able to go back and see what they bid
       on. Submitting is a different question and respond/ decides it there. */
    const pkgStatus = String(p.status || 'draft').toLowerCase();
    if (pkgStatus === 'draft' || pkgStatus === 'pending') {
      return NextResponse.json(
        { error: 'This bid package has not been issued yet. The general contractor will send it when the documents are ready.' },
        { status: 409 },
      );
    }
    if (p.sub_portal_expires_at && new Date(p.sub_portal_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This link has expired. Contact the general contractor.' }, { status: 410 });
    }

    const jacket = await assembleJacket(db, {
      packageId: inv.bid_package_id,
      tenantId,
      pkg: p,
      /* Real signed URLs — the bidder has no session to satisfy the proxy. */
      resolveUrl: (u) => (u ? signUrl(u, 3600) : null),
    });

    /* Has this bidder already priced it? The portal must say "submitted" rather
       than invite them to bid a second time. */
    const { data: mine } = await db
      .from('bid_submissions')
      .select('id, base_amount, amount, status, submitted_at')
      .eq('bid_package_id', inv.bid_package_id)
      .eq('tenant_id', tenantId)
      .eq('contact_email', String(inv.sub_email || '').toLowerCase())
      .maybeSingle();

    /* Closed = the due DAY is over in the GC company's own time zone
       (lib/bid-deadline), or the package is past taking bids (closed /
       awarded) or its portal is off. new Date(due_date) was midnight UTC — the
       evening before the due day in every US zone — and a closed or awarded
       package still offered the bid form, which respond then refused. Same
       rule as respond, so the page and the submit agree. */
    const closed = bidRefusal(p, await deadlineZone(db, tenantId, p.projects?.state)) !== null;

    /* First open is worth recording — a GC chasing bids needs to know who has
       looked and who has not. Never overwrite the original timestamp. */
    if (!inv.invitation_viewed_at) {
      await tryWrite(
        db.from('bid_package_invites')
          .update({
            invitation_viewed_at: new Date().toISOString(),
            response_status: inv.response_status === 'submitted' ? inv.response_status : 'viewed',
          } as never)
          .eq('id', inv.id)
          .eq('tenant_id', tenantId),
        'bid_package_invites viewed',
      );
    }

    return NextResponse.json({
      /* The bidder's copy: no competitor counts, no GC budget, no GC checklist. */
      ...forBidder(jacket),
      invite: {
        id: inv.id,
        company: inv.company_name || inv.sub_name || null,
        contact: inv.contact_name || null,
        email: inv.sub_email || null,
        status: inv.response_status || inv.status || 'invited',
        viewedAt: inv.invitation_viewed_at || null,
        respondedAt: inv.responded_at || null,
      },
      /* A bidder who missed the deadline still sees the jacket, read-only, and
         is told why they cannot price it — a blank page would just generate a
         phone call to the GC. */
      canSubmit: !closed && !['declined', 'revoked'].includes(String(inv.response_status || '')),
      closed,
      alreadySubmitted: mine
        ? {
            id: (mine as Record<string, any>).id,
            amount: (mine as Record<string, any>).base_amount ?? (mine as Record<string, any>).amount,
            submittedAt: (mine as Record<string, any>).submitted_at,
          }
        : null,
    });
  } catch (e) {
    return apiError('bid_jacket_portal', e);
  }
}
