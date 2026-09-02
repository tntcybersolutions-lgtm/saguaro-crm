import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendSubInvitedToBid } from '@/lib/email';

export async function GET(req: NextRequest) {
  try {
    const db = createServerClient();
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

    // Find bid packages due in 3 days
    const in3 = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const { data: packages } = await db
      .from('bid_packages')
      .select('*, projects(name), bid_submissions(count)')
      .eq('status', 'open')
      .lte('due_date', in3)
      .gte('due_date', today);

    let sent = 0;
    for (const pkg of (packages || []) as any[]) {
      // Get invites that haven't submitted
      const { data: invites } = await db
        .from('bid_package_invites')
        .select('*')
        .eq('bid_package_id', pkg.id)
        .eq('status', 'invited');

      for (const invite of (invites || []) as any[]) {
        await sendSubInvitedToBid(
          invite.sub_email, invite.sub_name,
          pkg.projects?.name || 'Project',
          pkg.trade, pkg.due_date,
          `REMINDER: Bid due ${pkg.due_date}. ${pkg.scope_summary || ''}`,
          `${APP_URL}/portals/sub/${invite.token}`
        );
        sent++;
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
    for (const pkg of (packages || []) as any[]) {
      if (!pkg.tenant_id) continue;
      const list = byTenant.get(pkg.tenant_id) ?? [];
      list.push(pkg);
      byTenant.set(pkg.tenant_id, list);
    }

    let notified = 0;
    for (const [tenantId, pkgs] of byTenant) {
      const soonest = pkgs
        .map((p) => p.due_date)
        .filter(Boolean)
        .sort()[0];
      const days = soonest
        ? Math.max(0, Math.ceil((new Date(soonest + 'T12:00:00').getTime() - Date.now()) / 86400000))
        : null;

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

    return NextResponse.json({ success: true, sent, notified });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
