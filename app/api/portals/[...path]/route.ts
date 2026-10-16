import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { onPayAppApproved } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';

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
      const { data } = await db.from('pay_applications').select('*, projects(*)').eq('owner_approval_token', token).single();
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const pa = data as any;
      return NextResponse.json({
        approval: {
          amount: pa.current_payment_due || 0,
          title: `Pay Application #${pa.app_number}`,
          project: pa.projects?.name || 'Project',
        },
        payApp: pa,
        project: pa.projects,
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
  const db = createServerClient();

  try {
    // POST /api/portals/owner/:token — the owner's Approve / Reject on
    // /owner-portal/approve/[token] (the page posts HERE).
    // owner_approval_token IS a live column (unique); the older note saying it
    // was missing is wrong. The token is the credential, as on the signing
    // portal. This now does what /api/owner-portal/approve/[token] does: it
    // refuses a token that was already used, stamps approved_at, and on an
    // approval runs the same cascade as the GC's Approve — conditional lien
    // waivers for every sub on the job. It used to certify the application
    // and stop: no approved_at, no waivers, and the link worked forever.
    if (portalType === 'owner' && token) {
      const body = await req.json().catch(() => ({}));
      const { decision, notes } = body as { decision?: string; notes?: string };
      if (decision !== 'approved' && decision !== 'rejected') {
        return NextResponse.json({ error: 'Choose Approve or Reject.' }, { status: 400 });
      }
      const { data: existing, error: exErr } = await db
        .from('pay_applications').select('id, approved_at').eq('owner_approval_token', token).maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });
      if ((existing as { approved_at?: string | null }).approved_at) {
        return NextResponse.json({ error: 'This pay application has already been reviewed.' }, { status: 409 });
      }
      const newStatus = decision === 'approved' ? 'certified' : 'draft';
      const patch: Record<string, unknown> = { status: newStatus, approval_notes: notes ?? null };
      if (decision === 'approved') patch.approved_at = new Date().toISOString();
      await must(db.from('pay_applications').update(patch).eq('owner_approval_token', token), 'pay_applications update');
      if (decision === 'approved') {
        runInBackground(onPayAppApproved(String((existing as { id: string }).id)), 'onPayAppApproved');
      }
      return NextResponse.json({ success: true });
    }

    // POST /api/portals/sub/:token/lien-waiver
    // Live lien_waivers columns: status, signed_at, signature_method, token.
    // There is no sign_token column (use token) and no signature_data column
    // (the captured signature payload is recorded as signature_method='portal'
    // rather than stored as data, since there is no jsonb column for it).
    if (portalType === 'sub' && token && subPath === 'lien-waiver') {
      await req.json().catch(() => ({}));
      const { error: writeErr } = await db.from('lien_waivers').update({ status: 'signed', signed_at: new Date().toISOString(), signature_method: 'portal' }).eq('token', token);
      // This route answers success right after. A rejected write used to
      // vanish — supabase-js returns { error } rather than throwing.
      if (writeErr) { console.error('[portals/lien-waiver-sign]', writeErr); throw writeErr; }
      return NextResponse.json({ success: true });
    }

    // POST /api/portals/w9/:token — handled by specific route file
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (err) {
    return apiError('portals', err, "Couldn't save that. Please try again.");
  }
}
