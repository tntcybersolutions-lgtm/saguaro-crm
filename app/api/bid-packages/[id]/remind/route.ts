import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendSubInvitedToBid } from '@/lib/email';
import { requirePermission } from '@/lib/permissions';
import { withComm } from '@/lib/comm-log';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/**
 * POST /api/bid-packages/[id]/remind
 * Body: { inviteId, packageId } (or { subId } — a roster sub's id)
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
    const inviteId: string | undefined = body?.inviteId;
    const subId: string | undefined = body?.subId;
    const packageId: string = body?.packageId || id;

    const db = createServerClient();

    // Load the bid package (tenant-scoped) along with its project name.
    const { data: pkg, error: pkgErr } = await db
      .from('bid_packages')
      .select('*, projects(name)')
      .eq('id', packageId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (pkgErr) throw pkgErr;

    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });

    const p = pkg as Record<string, any>;
    const projectName = p.projects?.name || p.name || 'Project';

    /* Find the invite. The package page sends the INVITE's id; this used to
       match it against sub_id only, so every Remind tap was a 404 (most invites
       have no roster sub at all). A roster sub's id still works. */
    const findBy = async (col: 'id' | 'sub_id', v: string) => {
      const { data, error } = await db
        .from('bid_package_invites')
        .select('*')
        .eq('bid_package_id', packageId)
        .eq('tenant_id', user.tenantId)
        .eq(col, v)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    };
    const key = inviteId || subId;
    if (!key) return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });
    const invite = (inviteId ? await findBy('id', inviteId) : null)
      ?? (subId ? (await findBy('sub_id', subId)) ?? (await findBy('id', subId)) : null);

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
    return apiError('bid-packages/remind', err);
  }
}
