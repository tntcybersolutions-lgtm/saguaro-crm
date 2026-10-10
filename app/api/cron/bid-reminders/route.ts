import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendSubInvitedToBid } from '@/lib/email';
import { withComm } from '@/lib/comm-log';
import { apiError } from '@/lib/api-error';
import { bidDueDay, daysUntilBidDue, BIDDING_STATUSES } from '@/lib/bid-deadline';
import { companyTimeZone } from '@/lib/time-zone';
import { inviteState } from '@/lib/bid-invite-state';

export async function GET(req: NextRequest) {
  /* Every other cron route in this directory carries this guard; this one was
     the exception. Unguarded it is a GET that anyone can call, on the service
     role key, that sends email to every invited subcontractor across EVERY
     tenant — a mailing trigger with a public URL. Same shape as
     cron/autopilot, cron/insurance-check and cron/lien-reminders. */
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createServerClient();
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

    /* Packages taking bids whose due DAY is today or within 3 days, counted in
       each GC company's own time zone (tenants.time_zone) — a job has no
       device here, and the deadline is the company's.

       This selected status 'open' only, so an issued package ('sent') — the
       state /issue and invite-subs put a package in — was never reminded. It
       read due_date only, so a package dated by bid_due_date was never
       reminded either. Both columns are read (the same day every screen
       shows); the window is decided below on the due day, so a bid_due_date
       timestamp and a due_date DATE count the same way. */
    /* A coarse lower bound for the query (yesterday in UTC covers every zone
       west of it); the day count below is exact, per company. */
    const floor = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const { data: candidates, error: pkgErr } = await db
      .from('bid_packages')
      .select('*, projects(name), bid_submissions(count)')
      .in('status', [...BIDDING_STATUSES])
      .eq('sub_portal_enabled', true)
      .or(`bid_due_date.gte.${floor},due_date.gte.${floor}`);
    if (pkgErr) throw pkgErr;
    const zoneByTenant = new Map<string, string>();
    for (const t of new Set(((candidates || []) as any[]).map((p) => p.tenant_id).filter(Boolean))) {
      const tz = await companyTimeZone(db, t as string);
      if (!tz) console.error(`[cron/bid-reminders] tenant ${t} has no time zone recorded — its bid due days are counted in UTC`);
      zoneByTenant.set(t as string, tz ?? 'UTC');
    }
    const zoneOf = (p: any) => zoneByTenant.get(p.tenant_id) ?? 'UTC';
    const packages = ((candidates || []) as any[]).filter((p) => {
      const d = daysUntilBidDue(p, zoneOf(p));
      return d !== null && d >= 0 && d <= 3;
    });

    let sent = 0;
    let failed = 0;
    for (const pkg of packages) {
      /* Still to answer: response_status invited or viewed. This filtered
         status = 'invited', which missed every bidder who had opened the link
         (the portal writes response_status 'viewed') and would have chased a
         revoked one. */
      const { data: invites, error: invErr } = await db
        .from('bid_package_invites')
        .select('*')
        .eq('bid_package_id', pkg.id)
        .eq('tenant_id', pkg.tenant_id)
        .in('response_status', ['invited', 'viewed']);
      if (invErr) throw invErr;

      const due = bidDueDay(pkg) || '';
      for (const invite of (invites || []) as any[]) {
        if (inviteState(invite) === 'revoked' || !invite.sub_email || !invite.token) continue;
        const mail = await withComm(
          { tenantId: pkg.tenant_id, projectId: pkg.project_id ?? null, bidPackageId: pkg.id, subId: invite.sub_id ?? null,
            relatedType: 'bid_reminder', relatedId: invite.id ?? null, toName: invite.company_name || invite.sub_name || null },
          () => sendSubInvitedToBid(
            invite.sub_email, invite.company_name || invite.sub_name || 'there',
            pkg.projects?.name || 'Project',
            pkg.trade || pkg.name || 'Bid package', due,
            `REMINDER: Bid due ${due}. ${pkg.scope_summary || ''}`,
            /* /portals/bid/<invite token> — the bidder's own jacket. This pointed
               at /portals/sub/<token>, which has no page (404) and whose auth
               route validates portal_sub_sessions.token, a different token
               entirely. Every reminder ever sent carried a dead link. */
            `${APP_URL}/portals/bid/${invite.token}`
          ),
        );
        /* Counted by what actually left, not by what was attempted. */
        if (mail.sent) sent++;
        else failed++;
      }
    }

    /**
     * Tell the GC too.
     *
     * This job has always emailed the SUBS and told the general contractor
     * nothing. So "70 live packages, 0 bids in, 3 closing this week" was a
     * fact the product knew every morning at one o'clock and never mentioned —
     * the GC found out by opening the Bid Center and reading it themselves,
     * if they thought to. A reminder that only goes outward is half a
     * reminder.
     *
     * One notification per tenant per run, naming the packages and how long is
     * left. It surfaces in the bell and, because it is unread, in the header
     * strip the next time they are in the app.
     */
    const byTenant = new Map<string, any[]>();
    for (const pkg of packages) {
      if (!pkg.tenant_id) continue;
      const list = byTenant.get(pkg.tenant_id) ?? [];
      list.push(pkg);
      byTenant.set(pkg.tenant_id, list);
    }

    let notified = 0;
    for (const [tenantId, pkgs] of byTenant) {
      const days = pkgs
        .map((p) => daysUntilBidDue(p, zoneOf(p)))
        .filter((d): d is number => d !== null)
        .sort((x, y) => x - y)[0] ?? null;

      const title = pkgs.length === 1
        ? `${pkgs[0].trade || 'A bid package'} closes ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`
        : `${pkgs.length} bid packages close within 3 days`;

      const noBids = pkgs.filter((p) => !(p.bid_submissions?.[0]?.count));
      const body = noBids.length
        ? `${noBids.length} of them have no bids in yet — chase the subs you invited.`
        : 'Review what came in and level the bids before they close.';

      const { error: notifyErr } = await db.from('notifications').insert({
        tenant_id: tenantId,
        type: 'bid_due',
        title,
        body,
        link: '/app/bids',
      } as never);
      /* A failed notification must not lose the emails that already went out,
         so this is logged rather than thrown. */
      if (notifyErr) console.error('[cron/bid-reminders] notification insert:', notifyErr.message);
      else notified++;
    }

    return NextResponse.json({ success: true, packages: packages.length, sent, failed, notified });
  } catch (e) {
    return apiError('cron/bid-reminders', e);
  }
}
