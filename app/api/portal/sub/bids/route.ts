import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { must, tryWrite } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

/**
 * Subcontractor portal — bid invitations and bid submission.
 *
 * This route read `portal_sub_bid_invitations` and wrote
 * `portal_sub_bid_responses` / `portal_sub_bid_line_items`. The GC side writes
 * `bid_package_invites` and reads `bid_submissions`. They are two disconnected
 * halves of one workflow:
 *
 *   - Nothing in the codebase has ever INSERTED into portal_sub_bid_invitations,
 *     so a sub's bid list was guaranteed to be empty no matter how many subs a
 *     GC invited. All five tables hold 0 rows in production against 70 bid
 *     packages and 499 line items — packages were being built and never sent.
 *   - The list query embedded `bid_package:bid_package_id(id, title, …)` and
 *     bid_packages has no `title` column; it is `name`. PostgREST rejects an
 *     unknown embedded column outright, so the request 500'd before it could
 *     even return the empty list that was all it could ever return.
 *
 * Both halves now use the GC's tables, which are the ones with the invite
 * token, the view tracking and the response status the rest of the app reads.
 * The portal_sub_bid_* tables are left alone and unused rather than migrated —
 * they have never held a row.
 *
 * NDA capture is not carried over: nda_signed lived only on the orphan table,
 * nothing ever set it, and bid_package_invites has no equivalent column. It
 * needs a schema decision, not a silent reimplementation.
 */

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .maybeSingle();

  return session as Record<string, string> | null;
}

/** Invites belonging to this portal session: same tenant, and either the linked
 *  sub record or the email the session was issued to. */
function invitesForSession(db: ReturnType<typeof createServerClient>, session: Record<string, string>) {
  let q = db
    .from('bid_package_invites')
    .select('*')
    .eq('tenant_id', session.tenant_id);

  const email = (session.sub_email || '').toLowerCase();
  if (session.sub_id && email) q = q.or(`sub_id.eq.${session.sub_id},sub_email.eq.${email}`);
  else if (session.sub_id) q = q.eq('sub_id', session.sub_id);
  else q = q.eq('sub_email', email);

  return q;
}

/** GET — bid invitations for this sub */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    }

    const db = createServerClient();

    const { data: invites, error } = await invitesForSession(db, session)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (invites || []) as Record<string, string>[];
    if (!rows.length) return NextResponse.json({ bids: [] });

    /* Package detail fetched separately rather than through an embed. The embed
       named a column that does not exist, and a join failure took the whole
       list down; a second scoped read cannot. */
    const pkgIds = [...new Set(rows.map((r) => r.bid_package_id).filter(Boolean))];
    const { data: pkgs } = await db
      .from('bid_packages')
      .select('id, name, trade, description, status, bid_due_date, due_date, project_id, addendum_count')
      .in('id', pkgIds)
      .eq('tenant_id', session.tenant_id);

    const byId = new Map((pkgs || []).map((p: Record<string, unknown>) => [p.id as string, p]));

    /* Whether this sub has already bid — the portal has to show "submitted"
       rather than inviting them to bid twice. */
    const { data: mine } = await db
      .from('bid_submissions')
      .select('id, bid_package_id, base_amount, amount, status, submitted_at')
      .in('bid_package_id', pkgIds)
      .eq('tenant_id', session.tenant_id)
      .eq('contact_email', (session.sub_email || '').toLowerCase());

    const submittedFor = new Map(
      ((mine || []) as Record<string, unknown>[]).map((s) => [s.bid_package_id as string, s]),
    );

    const bids = rows.map((inv) => {
      const pkg = byId.get(inv.bid_package_id) as Record<string, unknown> | undefined;
      const sub = submittedFor.get(inv.bid_package_id) as Record<string, unknown> | undefined;
      const due = (pkg?.bid_due_date as string) || (pkg?.due_date as string) || null;
      return {
        id: inv.id,
        token: inv.token,
        status: inv.response_status || inv.status || 'invited',
        invitedAt: inv.invitation_sent_at || inv.invited_at || inv.created_at,
        viewedAt: inv.invitation_viewed_at || null,
        respondedAt: inv.responded_at || null,
        dueDate: due,
        isOverdue: !!due && new Date(due).getTime() < Date.now(),
        addendumCount: (pkg?.addendum_count as number) ?? 0,
        bidPackage: pkg
          ? {
              id: pkg.id,
              /* `name`, not `title` — the column this route used to ask for. */
              name: pkg.name,
              trade: pkg.trade,
              description: pkg.description,
              status: pkg.status,
              projectId: pkg.project_id,
            }
          : null,
        submitted: sub
          ? { id: sub.id, amount: sub.base_amount ?? sub.amount, submittedAt: sub.submitted_at, status: sub.status }
          : null,
      };
    });

    return NextResponse.json({ bids });
  } catch (e) {
    return apiError('portal_sub_bids', e);
  }
}

/** POST — submit a bid against an invitation */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    }

    const db = createServerClient();
    const body = await req.json().catch(() => ({}));
    const inviteId = body.bid_invitation_id || body.inviteId;
    if (!inviteId) {
      return NextResponse.json({ error: 'bid_invitation_id is required' }, { status: 400 });
    }

    /* The invite must belong to this session before anything is written. */
    const { data: invite } = await invitesForSession(db, session).eq('id', inviteId).maybeSingle();
    if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    const inv = invite as Record<string, string>;

    const { data: pkg } = await db
      .from('bid_packages')
      .select('id, project_id, tenant_id, bid_due_date, due_date, status')
      .eq('id', inv.bid_package_id)
      .eq('tenant_id', session.tenant_id)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    const p = pkg as Record<string, string>;

    const due = p.bid_due_date || p.due_date;
    if (due && new Date(due).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Bidding for this package has closed.' }, { status: 409 });
    }

    const amount = Number(body.total_amount ?? body.amount ?? body.base_amount ?? 0) || 0;
    if (amount <= 0) {
      return NextResponse.json({ error: 'A bid amount is required.' }, { status: 400 });
    }

    const email = (session.sub_email || '').toLowerCase();
    const now = new Date().toISOString();

    const row = {
      tenant_id: session.tenant_id,
      project_id: p.project_id,
      bid_package_id: inv.bid_package_id,
      sub_id: inv.sub_id || null,
      sub_name: inv.sub_name || session.sub_company || null,
      sub_email: email,
      company_name: inv.company_name || session.sub_company || null,
      contact_name: session.sub_contact_name || inv.contact_name || null,
      contact_email: email,
      /* base_amount AND amount are both written to the same figure on purpose.
         amount defaults to 0 rather than null, and the award path reads
         `sub.amount ?? sub.base_amount` — with amount sitting at its 0 default
         that coalesce returns 0, so an award would record $0 and skip the
         purchase order entirely. Populating both keeps every existing reader
         correct whichever column it happens to read. */
      base_amount: amount,
      amount,
      scope_notes: body.notes || body.scope_notes || null,
      inclusions: body.inclusions || null,
      exclusions: body.exclusions || null,
      clarifications: body.clarifications || null,
      schedule_days: body.schedule_days != null ? Number(body.schedule_days) : null,
      bid_bond_submitted: body.bid_bond_submitted === true,
      status: 'submitted',
      submitted_at: now,
      received_at: now,
    };

    /* One bid per sub per package: re-submitting before the deadline replaces
       the previous figure instead of stacking duplicate bids the GC would then
       have to level against each other. */
    const { data: existing } = await db
      .from('bid_submissions')
      .select('id')
      .eq('bid_package_id', inv.bid_package_id)
      .eq('tenant_id', session.tenant_id)
      .eq('contact_email', email)
      .maybeSingle();

    let submissionId: string;
    if (existing) {
      await must(
        db.from('bid_submissions').update(row as never)
          .eq('id', (existing as Record<string, string>).id)
          .eq('tenant_id', session.tenant_id),
        'bid_submissions update',
      );
      submissionId = (existing as Record<string, string>).id;
    } else {
      const { data: created } = await must(
        db.from('bid_submissions').insert(row as never).select('id').single(),
        'bid_submissions insert',
      );
      submissionId = (created as Record<string, string>).id;
    }

    await must(
      db.from('bid_package_invites')
        .update({
          status: 'submitted',
          response_status: 'submitted',
          responded_at: now,
          invitation_viewed_at: inv.invitation_viewed_at || now,
        } as never)
        .eq('id', inv.id)
        .eq('tenant_id', session.tenant_id),
      'bid_package_invites update',
    );

    /* Keep the GC-facing counts honest. */
    const { count } = await db
      .from('bid_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('bid_package_id', inv.bid_package_id)
      .eq('tenant_id', session.tenant_id);

    /* tryWrite, not a bare await: supabase-js returns { error } rather than
       throwing. The bid is already committed, so a failed counter must not fail
       the sub's submission — but it must not disappear either, or the GC's
       package keeps showing 0 responses against a bid that is sitting there. */
    await tryWrite(
      db.from('bid_packages')
        .update({ num_responded: count ?? 1, bid_count: count ?? 1 } as never)
        .eq('id', inv.bid_package_id)
        .eq('tenant_id', session.tenant_id),
      'bid_packages num_responded',
    );

    return NextResponse.json({ success: true, submissionId });
  } catch (e) {
    return apiError('portal_sub_bids', e);
  }
}
