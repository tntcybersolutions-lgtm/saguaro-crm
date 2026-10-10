import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/bid-packages/portal?token=…: retired.
 *
 * This was the first bidder endpoint, from before the jacket. With no login it
 * returned the package's bid_package_items(*) (the GC's own unit prices and
 * totals) to anyone holding an invite token, and its POST accepted a bid
 * whatever the package's status or due date, writing only base_amount. No page
 * calls it: the bidder portal is /portals/bid/<token>, served by
 * /api/bid-packages/portal/<token> and /respond, which show bidders only what
 * a bidder should see and check the status, the deadline and the portal switch.
 *
 * It answers 410 and points at the current link, and reads nothing: a token
 * sent here is never looked up, so this cannot be used to test which tokens
 * exist.
 */

function gone(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')?.trim() || '';
  return NextResponse.json(
    {
      error: 'This bid link is out of date. Open the bid invitation link from your email instead.',
      portal: token ? `/portals/bid/${encodeURIComponent(token)}` : '/portals/bid/<token>',
    },
    { status: 410 },
  );
}

export async function GET(req: NextRequest) {
  return gone(req);
}

export async function POST(req: NextRequest) {
  return gone(req);
}
