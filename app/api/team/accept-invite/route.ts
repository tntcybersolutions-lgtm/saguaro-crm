/**
 * /api/team/accept-invite — Team-invite verification + redemption.
 *
 * The invite email (see /api/team/invite) links to /accept-invite?token=...
 * This route backs that page:
 *
 *   GET  ?token=      → Public. Returns the single invite the token names, joined
 *                       with the inviting company + inviter's display name. Never
 *                       leaks any other tenant's data (only the invite's own tenant).
 *
 *   POST { token }    → Auth required (getUser). Validates the invite is pending +
 *                       not expired + the logged-in user's email matches the invited
 *                       email, then:
 *                         (a) moves the accepting user into the tenant
 *                             (profiles.tenant_id + role) — this is how membership
 *                             is modeled: one tenant per user via profiles.tenant_id;
 *                         (b) if project_id is set, adds them to project_team;
 *                         (c) marks the invite accepted (idempotent — a second
 *                             accept is rejected via a conditional status='pending'
 *                             claim);
 *                         (d) best-effort notifies the inviter.
 *
 * team_invites has no expires_at column; the invitation email promises a 7-day
 * window, so expiry is computed from created_at + 7 days.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { grantInvitedRole, findInviteByToken } from '@/lib/invite-role';
import { createNotification } from '@/lib/notifications';
import { must } from '@/lib/db-write';

const INVITE_TTL_DAYS = 7;

function isExpired(createdAt: string | null): boolean {
  if (!createdAt) return false; // be lenient if we somehow have no timestamp
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() > created + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/** Human-friendly company name for a tenant. */
function tenantName(t: { name?: string | null; company_name?: string | null } | null): string {
  return (t?.company_name || t?.name || 'a company on Saguaro').trim();
}

// ─── GET: verify a token, describe the invite ────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ valid: false, reason: 'invalid', error: 'Missing invite token.' }, { status: 400 });
  }

  try {
    const db = createServerClient();

    const { data: invite, error } = await findInviteByToken(db, token) as { data: any; error: any };

    if (error) {
      console.error('[accept-invite GET] lookup error:', error.message);
      return NextResponse.json({ valid: false, reason: 'error', error: 'Could not load this invitation.' }, { status: 500 });
    }
    if (!invite) {
      return NextResponse.json({ valid: false, reason: 'invalid', error: 'This invitation link is not valid.' }, { status: 404 });
    }

    // Only ever read the ONE tenant this invite points at — never enumerate others.
    const { data: tenant } = await db
      .from('tenants')
      .select('name, company_name')
      .eq('id', invite.tenant_id)
      .maybeSingle();

    let inviterName = 'A teammate';
    if (invite.invited_by) {
      const { data: inviter } = await db
        .from('profiles')
        .select('full_name, first_name, email')
        .eq('id', invite.invited_by)
        .maybeSingle();
      if (inviter) {
        inviterName = (inviter as any).full_name || (inviter as any).first_name || (inviter as any).email || inviterName;
      }
    }

    let projectName: string | null = null;
    if (invite.project_id) {
      const { data: project } = await db
        .from('projects')
        .select('name')
        .eq('id', invite.project_id)
        .maybeSingle();
      projectName = (project as any)?.name || null;
    }

    // Determine the effective state (pending / accepted / expired).
    let reason: 'pending' | 'accepted' | 'expired' = 'pending';
    if (invite.status === 'cancelled') {
      return NextResponse.json({ valid: false, reason: 'invalid', error: 'This invitation was cancelled.' }, { status: 404 });
    }
    if (invite.status === 'accepted') reason = 'accepted';
    else if (invite.status === 'expired' || isExpired(invite.created_at)) reason = 'expired';

    return NextResponse.json({
      valid: reason === 'pending',
      reason,
      email: invite.email,
      name: invite.name || null,
      role: invite.role || 'member',
      company: tenantName(tenant),
      inviterName,
      projectId: invite.project_id || null,
      projectName,
      acceptedAt: invite.accepted_at || null,
    });
  } catch (err) {
    console.error('[accept-invite GET] exception:', err);
    return NextResponse.json({ valid: false, reason: 'error', error: 'Could not load this invitation.' }, { status: 500 });
  }
}

// ─── POST: redeem a token (auth required) ────────────────────────────────────
export async function POST(req: NextRequest) {
  const res = NextResponse.next();
  const user = await getUser(req, res);
  if (!user) {
    return NextResponse.json(
      { error: 'You must be signed in to accept this invitation.', reason: 'not_authenticated' },
      { status: 401 },
    );
  }

  let token: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    token = (body?.token || '').trim();
  } catch {
    /* handled below */
  }
  if (!token) {
    return NextResponse.json({ error: 'Missing invite token.', reason: 'invalid' }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const nowIso = new Date().toISOString();

    const { data: invite, error: findErr } = await findInviteByToken(db, token) as { data: any; error: any };

    if (findErr) {
      console.error('[accept-invite POST] lookup error:', findErr.message);
      return NextResponse.json({ error: 'Could not load this invitation.', reason: 'error' }, { status: 500 });
    }
    if (!invite) {
      return NextResponse.json({ error: 'This invitation link is not valid.', reason: 'invalid' }, { status: 404 });
    }

    if (invite.status === 'cancelled') {
      return NextResponse.json({ error: 'This invitation was cancelled. Ask for a new one.', reason: 'invalid' }, { status: 404 });
    }

    // Already redeemed — reject (idempotent-safe).
    if (invite.status === 'accepted') {
      return NextResponse.json(
        { error: 'This invitation has already been accepted.', reason: 'already_accepted' },
        { status: 409 },
      );
    }

    // Expired (either flagged, or past the 7-day window).
    if (invite.status === 'expired' || isExpired(invite.created_at)) {
      if (invite.status !== 'expired') {
        await must(db.from('team_invites').update({ status: 'expired' }).eq('id', invite.id), 'team_invites update');
      }
      return NextResponse.json(
        { error: 'This invitation has expired. Please ask for a new one.', reason: 'expired' },
        { status: 410 },
      );
    }

    // The signed-in user's email must match the invited address.
    const invitedEmail = (invite.email || '').toLowerCase().trim();
    const myEmail = (user.email || '').toLowerCase().trim();
    if (!myEmail || myEmail !== invitedEmail) {
      return NextResponse.json(
        {
          error: `This invitation was sent to ${invite.email}. You're signed in as ${user.email || 'another account'}.`,
          reason: 'email_mismatch',
          invitedEmail: invite.email,
          yourEmail: user.email,
        },
        { status: 403 },
      );
    }

    // Atomically CLAIM the invite: only succeeds while it is still 'pending'.
    // If a concurrent request already flipped it, `claimed` is null → reject.
    const { data: claimed, error: claimErr } = await db
      .from('team_invites')
      .update({ status: 'accepted', accepted_at: nowIso })
      .eq('id', invite.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimErr) {
      console.error('[accept-invite POST] claim error:', claimErr.message);
      return NextResponse.json({ error: 'Could not accept the invitation.', reason: 'error' }, { status: 500 });
    }
    if (!claimed) {
      return NextResponse.json(
        { error: 'This invitation has already been accepted.', reason: 'already_accepted' },
        { status: 409 },
      );
    }

    const role = invite.role || 'member';

    // Company display name for the profile + project_team rows.
    const { data: tenant } = await db
      .from('tenants')
      .select('name, company_name')
      .eq('id', invite.tenant_id)
      .maybeSingle();
    const company = tenantName(tenant);

    // (a) Move the accepting user into the tenant. Membership = profiles.tenant_id + role.
    const { error: profileErr } = await db
      .from('profiles')
      .update({ tenant_id: invite.tenant_id, role, company, updated_at: nowIso })
      .eq('id', user.id);
    if (profileErr) {
      // The invite is already marked accepted; surface the real failure so the
      // user isn't silently left in the wrong tenant.
      console.error('[accept-invite POST] profile update failed:', profileErr.message);
      return NextResponse.json(
        { error: 'We accepted your invite but could not update your membership. Please contact support.', reason: 'error' },
        { status: 500 },
      );
    }

    // The role they were invited as must carry its permissions, not just a label.
    await grantInvitedRole(db, { tenantId: invite.tenant_id, userId: user.id, role, projectId: invite.project_id, assignedBy: invite.invited_by });

    // Current display name for the project_team row.
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .maybeSingle();
    const memberName = (profile as any)?.full_name || (user.email || '').split('@')[0] || 'Team member';

    // (b) If the invite targets a project, add them to project_team (no duplicates).
    let projectAdded = false;
    if (invite.project_id) {
      const { data: existing } = await db
        .from('project_team')
        .select('id')
        .eq('project_id', invite.project_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        projectAdded = true;
      } else {
        const { error: teamErr } = await db.from('project_team').insert({
          tenant_id: invite.tenant_id,
          project_id: invite.project_id,
          user_id: user.id,
          name: memberName,
          email: user.email || invite.email,
          role,
          company,
          phone: (profile as any)?.phone || null,
          added_at: nowIso,
        });
        if (teamErr) {
          // Non-fatal: they're in the tenant; log the project-team gap honestly.
          console.error('[accept-invite POST] project_team insert failed:', teamErr.message);
        } else {
          projectAdded = true;
        }
      }
    }

    // (d) Best-effort: notify the inviter that the invite was accepted.
    try {
      await createNotification(
        invite.tenant_id,
        invite.invited_by || null,
        'sub_added',
        `${memberName} joined your team`,
        `${user.email} accepted your invitation to join ${company} as ${role}.`,
        invite.project_id ? `/app/projects/${invite.project_id}/team` : '/app/people?tab=access',
        invite.project_id || undefined,
      );
    } catch { /* non-fatal */ }

    return NextResponse.json({
      success: true,
      company,
      role,
      projectAdded,
      redirect: '/app',
    });
  } catch (err) {
    console.error('[accept-invite POST] exception:', err);
    return NextResponse.json({ error: 'Could not accept the invitation.', reason: 'error' }, { status: 500 });
  }
}
