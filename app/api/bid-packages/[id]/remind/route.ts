import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendSubInvitedToBid } from '@/lib/email';
import { requirePermission } from '@/lib/permissions';
import { withComm } from '@/lib/comm-log';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/**
 * POST /api/bid-packages/[id]/remind
 * Body: { subId, packageId }
 * Look up the invited sub + bid package, send a reminder bid-invitation email.
 * Returns { success }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const body = await req.json().catch(() => ({}));
    const subId: string | undefined = body?.subId;
    const packageId: string = body?.packageId || id;

    const db = createServerClient();

    // Load the bid package (tenant-scoped) along with its project name.
    const { data: pkg } = await db
      .from('bid_packages')
      .select('*, projects(name)')
      .eq('id', packageId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });

    const p = pkg as Record<string, any>;
    const projectName = p.projects?.name || p.name || 'Project';

    // Find the matching invite. The caller always sends subId; match on it when
    // present, otherwise treat subId as a possible invite id as a fallback.
    let inviteQuery = db
      .from('bid_package_invites')
      .select('*')
      .eq('bid_package_id', packageId)
      .eq('tenant_id', user.tenantId);
    if (subId) inviteQuery = inviteQuery.eq('sub_id', subId);

    const { data: invite } = await inviteQuery.limit(1).maybeSingle();

    if (!invite) return NextResponse.json({ error: 'Invited subcontractor not found' }, { status: 404 });

    const inv = invite as Record<string, any>;
    const to: string | undefined = inv.sub_email;
    if (!to) return NextResponse.json({ error: 'No email address on file for this subcontractor' }, { status: 400 });

    const subName = inv.contact_name || inv.company_name || inv.sub_name || 'Subcontractor';
    /* /portals/bid/<invite token> is the bidder's jacket. This sent
       /portals/sub/<token>, a page that does not exist — the same dead link
       the cron reminders and invites had until they were fixed. */
    if (!inv.token) return NextResponse.json({ error: 'This invite has no bid link yet — re-send the invitation.' }, { status: 409 });
    const portalUrl = `${APP_URL}/portals/bid/${inv.token}`;

    const mail = await withComm(
      { tenantId: user.tenantId, projectId: p.project_id ?? null, bidPackageId: packageId, subId: inv.sub_id ?? null,
        relatedType: 'bid_reminder', relatedId: inv.id ?? null, toName: subName, createdBy: user.id },
      () => sendSubInvitedToBid(
        to,
        subName,
        projectName,
        p.trade || 'Trade',
        p.bid_due_date || p.due_date || '',
        p.scope_summary || p.scope_of_work || '',
        portalUrl,
      ),
    );
    // Say so when it didn't go — a reminder "sent" that never left is worse than none.
    if (!mail.sent) return NextResponse.json({ error: mail.error || 'The reminder was not sent.', sentTo: to }, { status: 502 });

    return NextResponse.json({ success: true, sentTo: to });
  } catch (err) {
    console.error('[bid-packages/[id]/remind]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
