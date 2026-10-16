import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { POST as ownerDecisionPost } from '@/app/api/owner-portal/approve/[token]/route';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [portalType, token] = path;
  const db = createServerClient();

  try {
    // GET /api/portals/owner/:token
    if (portalType === 'owner' && token) {
      /* Only what the owner's approval screen shows. This returned the whole
         pay_applications row and projects(*) — the GC's internal notes,
         overhead and profit percentages — to anyone holding the link, and the
         page never read either. */
      const { data, error } = await db
        .from('pay_applications')
        .select('app_number, current_payment_due, status, approved_at, projects(name)')
        .eq('owner_approval_token', token)
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const pa = data as unknown as { app_number: number | null; current_payment_due: number | null; status: string | null; approved_at: string | null; projects: { name: string | null } | null };
      return NextResponse.json({
        approval: {
          amount: Number(pa.current_payment_due) || 0,
          title: `Pay Application #${pa.app_number ?? ''}`,
          project: pa.projects?.name || 'Project',
          status: pa.status,
          decided: !!pa.approved_at,
        },
      });
    }

    /* GET /api/portals/sub/:token: retired. With no login it returned the
       whole bid_packages row for any invite token (budget_estimate, the GC's
       notes, leveling notes) plus bid_package_items(*) with the GC's unit
       prices. No page calls it; the bidder's jacket is /portals/bid/<token>.
       It answers 410 without reading anything, so it cannot be used to test
       which tokens exist. */
    if (portalType === 'sub' && token && path.length === 2) {
      return NextResponse.json(
        {
          error: 'This bid link is out of date. Open the bid invitation link from your email instead.',
          portal: `/portals/bid/${encodeURIComponent(token)}`,
        },
        { status: 410 },
      );
    }

    // GET /api/portals/w9/:token — handled by specific route file
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (err) {
    return apiError('portals', err, "Couldn't open this page. Please try again.");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [portalType, token, subPath] = path;

  try {
    /* POST /api/portals/owner/:token — the owner's approve / reject.
       This branch wrote the decision blind: no check that the token matched a
       pay app, no check that it had not already been decided (the same link
       could approve, then reject, then approve again), no approved_at, and the
       lien-waiver cascade an approval must fire never ran. The dedicated route
       (/api/owner-portal/approve/[token]) does all of that, so the decision is
       handed to it — one set of rules for the one action. This page sends
       { decision, notes }; that route reads { action, note }. */
    if (portalType === 'owner' && token && path.length === 2) {
      const body = (await req.json().catch(() => null)) as { decision?: unknown; notes?: unknown } | null;
      const decision = body?.decision === 'approved' ? 'approved' : body?.decision === 'rejected' ? 'rejected' : null;
      if (!decision) return NextResponse.json({ error: 'Choose approve or reject.' }, { status: 400 });
      const forward = new NextRequest(req.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: decision, note: typeof body?.notes === 'string' ? body.notes : null }),
      });
      return ownerDecisionPost(forward, { params: Promise.resolve({ token }) });
    }

    /* POST /api/portals/sub/:token/lien-waiver: retired. With no login and no
       signature it marked any waiver whose token it was given as SIGNED — no
       signer name, no signature, no check the waiver was still open — and
       answered success even when the token matched nothing. No page calls it;
       waivers are signed at /portals/sign/<token>, which captures the signer.
       It answers 410 without reading anything, so it cannot be used to test
       which tokens exist. */
    if (portalType === 'sub' && token && subPath === 'lien-waiver') {
      return NextResponse.json(
        {
          error: 'This signing link is out of date. Open the lien waiver link from your email instead.',
          portal: `/portals/sign/${encodeURIComponent(token)}`,
        },
        { status: 410 },
      );
    }

    // POST /api/portals/w9/:token — handled by specific route file
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (err) {
    return apiError('portals', err, "Couldn't save that. Please try again.");
  }
}
