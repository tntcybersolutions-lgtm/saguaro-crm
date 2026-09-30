import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { must, tryWrite } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { onBidSubmitted } from '@/lib/triggers';
import { logActivity, money } from '@/lib/activity';

/**
 * POST /api/bid-packages/portal/[token]/respond
 *
 * The bidder's answer: a price, or a decline. Token-gated, no session — a
 * subcontractor has no account, which is why this and the jacket read are the
 * two endpoints that let a bid actually come back.
 *
 * A decline matters as much as a bid. A GC who learns on the due date that
 * three of five invitees were never going to price it has lost the week they
 * needed to re-solicit the trade. Recording it is the whole point of tracking
 * invitations at all.
 */

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { allowed, resetIn } = checkRateLimit(`bid-respond:${getClientIP(req)}`, 5, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) } },
    );
  }

  try {
    const db = createServerClient();
    const body = await req.json().catch(() => ({}));
    const action = body.action === 'decline' ? 'decline' : 'submit';

    const { data: invite } = await db
      .from('bid_package_invites').select('*').eq('token', token).maybeSingle();
    if (!invite) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    const inv = invite as Record<string, any>;
    if (['revoked', 'withdrawn'].includes(String(inv.status || ''))) {
      return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    }

    const tenantId = inv.tenant_id as string;

    const { data: pkg } = await db
      .from('bid_packages')
      /* name and trade are read so the history can say WHICH package the bid
         landed on. Without them the feed read "bid $11,450 on a package",
         which is the one detail that makes the line worth reading. */
      .select('id, tenant_id, project_id, status, bid_due_date, due_date, name, trade')
      .eq('id', inv.bid_package_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    const p = pkg as Record<string, any>;

    /* THE PACKAGE'S OWN STATE WAS NEVER CHECKED. The invite, the tenant and
       the due date were, and then a bid was accepted whatever state the
       package was in.

       Found by walking the lifecycle end to end: /issue correctly REFUSED to
       send an incomplete jacket ("missing: Drawings, Specifications, Bid
       Form"), so the package stayed in draft — and both invited subs then
       opened the portal and submitted priced bids against a scope the GC had
       never issued. The GC ends up holding bids on a jacket they were
       deliberately stopped from sending.

       The other end is worse. 'closed' and 'awarded' were equally acceptable,
       so a sub holding the link could submit after bidding shut and after the
       job was awarded, landing a new row in a leveling sheet somebody had
       already made a decision from. The due-date check did not cover it: a GC
       who closes early, or awards before the date, leaves the window open.

       'sent' is what /issue sets. Anything earlier is not open yet; anything
       later is over. */
    const pkgStatus = String(p.status || 'draft').toLowerCase();
    if (pkgStatus === 'draft' || pkgStatus === 'pending') {
      return NextResponse.json(
        { error: 'This bid package has not been issued yet. The general contractor will send it when the documents are ready.' },
        { status: 409 },
      );
    }
    if (['closed', 'awarded', 'cancelled', 'canceled', 'archived'].includes(pkgStatus)) {
      return NextResponse.json({ error: 'Bidding for this package has closed.' }, { status: 409 });
    }

    const due = p.bid_due_date || p.due_date;
    if (due && new Date(due).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Bidding for this package has closed.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const email = String(inv.sub_email || '').toLowerCase();

    if (action === 'decline') {
      await must(
        db.from('bid_package_invites')
          .update({
            status: 'declined', response_status: 'declined', responded_at: now,
            invitation_viewed_at: inv.invitation_viewed_at || now,
          } as never)
          .eq('id', inv.id).eq('tenant_id', tenantId),
        'bid_package_invites decline',
      );
      return NextResponse.json({ success: true, action: 'declined' });
    }

    const amount = Number(body.amount ?? body.base_amount ?? 0) || 0;
    if (amount <= 0) return NextResponse.json({ error: 'A bid amount is required.' }, { status: 400 });

    const row = {
      tenant_id: tenantId,
      project_id: p.project_id,
      bid_package_id: inv.bid_package_id,
      sub_id: inv.sub_id || null,
      sub_name: inv.sub_name || inv.company_name || null,
      sub_email: email,
      company_name: inv.company_name || inv.sub_name || null,
      contact_name: body.contactName || inv.contact_name || null,
      contact_email: email,
      /* Both columns, same figure. bid_submissions.amount defaults to 0 rather
         than null, and several readers coalesce `amount ?? base_amount` — with
         amount sitting at its default that yields 0, which is how an award
         could record $0 and silently skip creating the purchase order. */
      base_amount: amount,
      amount,
      scope_notes: body.notes || null,
      inclusions: body.inclusions || null,
      exclusions: body.exclusions || null,
      clarifications: body.clarifications || null,
      schedule_days: body.scheduleDays != null ? Number(body.scheduleDays) : null,
      bid_bond_submitted: body.bidBond === true,
      status: 'submitted',
      submitted_at: now,
      received_at: now,
    };

    /* One bid per bidder per package — re-pricing before the deadline replaces
       the figure rather than stacking duplicates the GC must then level. */
    const { data: existing } = await db
      .from('bid_submissions').select('id')
      .eq('bid_package_id', inv.bid_package_id).eq('tenant_id', tenantId)
      .eq('contact_email', email).maybeSingle();

    let submissionId: string;
    if (existing) {
      await must(
        db.from('bid_submissions').update(row as never)
          .eq('id', (existing as Record<string, any>).id).eq('tenant_id', tenantId),
        'bid_submissions update',
      );
      submissionId = (existing as Record<string, any>).id;
    } else {
      const { data: created } = await must(
        db.from('bid_submissions').insert(row as never).select('id').single(),
        'bid_submissions insert',
      );
      submissionId = (created as Record<string, any>).id;
    }

    await must(
      db.from('bid_package_invites')
        .update({
          status: 'submitted', response_status: 'submitted', responded_at: now,
          invitation_viewed_at: inv.invitation_viewed_at || now,
        } as never)
        .eq('id', inv.id).eq('tenant_id', tenantId),
      'bid_package_invites submitted',
    );

    const { count } = await db
      .from('bid_submissions').select('id', { count: 'exact', head: true })
      .eq('bid_package_id', inv.bid_package_id).eq('tenant_id', tenantId);

    await tryWrite(
      db.from('bid_packages')
        .update({ num_responded: count ?? 1, bid_count: count ?? 1 } as never)
        .eq('id', inv.bid_package_id).eq('tenant_id', tenantId),
      'bid_packages num_responded',
    );

    /* Tell the GC. onBidSubmitted has existed with zero callers, which is why a
       bid arriving was never announced to anyone. */
    onBidSubmitted(submissionId).catch((e) => console.error('[bid respond] notify failed', e));

    /* A bid arriving is the event a GC most wants to see without being told.
       No user_id here on purpose — this half of the loop is the SUBCONTRACTOR
       acting through their token, not a signed-in member of the tenant, and
       recording it against a staff account would be a lie in the history. */
    void logActivity({
      tenantId,
      projectId: (pkg as Record<string, any> | null)?.project_id ?? null,
      userName: String(inv.company_name || inv.sub_name || inv.sub_email || 'Subcontractor'),
      action: 'bid_received',
      entityType: 'bid',
      entityId: submissionId,
      description: `${inv.company_name || inv.sub_name || 'A subcontractor'} bid ${money(amount)} on ${(pkg as Record<string, any> | null)?.name || (pkg as Record<string, any> | null)?.trade || 'a package'}`,
      metadata: { amount, packageId: inv.bid_package_id },
    });

    return NextResponse.json({ success: true, action: 'submitted', submissionId });
  } catch (e) {
    return apiError('bid_portal_respond', e);
  }
}
