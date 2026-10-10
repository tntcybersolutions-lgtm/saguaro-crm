import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { createNotification } from '@/lib/notifications';
import { sendInviteTeamMember } from '@/lib/email';
import { apiError } from '@/lib/api-error';
import { writeWithOptionalColumns } from '@/lib/optional-column';

/* The invitee's name. team_invites has no `name` column yet, so the name typed
   on the invite form was thrown away and the roster could only show an email.
   The insert below sends it as an OPTIONAL column (dropped and retried only if
   the database says the column is missing), so it starts persisting the moment
   this migration runs:
     ALTER TABLE public.team_invites ADD COLUMN IF NOT EXISTS name text;        */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

// Reads must never be frozen at their first result (App Router caches GET by default).
export const dynamic = 'force-dynamic';

/**
 * GET /api/team/invite
 * List this tenant's PENDING invites (tenant-scoped), newest first. Powers the
 * "Pending Invites" panel in the Roles & Access → User Assignments tab. There is
 * no expires_at column — invites are treated as expiring 7 days after created_at,
 * computed client-side from created_at.
 */
export async function GET(req: NextRequest) {
  // Listing who has a standing invite into the tenant is an access-control read.
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    // Optional ?projectId= narrows to the invites sent from one job's Team page.
    const projectId = req.nextUrl.searchParams.get('projectId') || req.nextUrl.searchParams.get('project_id');
    // `*` rather than a column list so the invitee's `name` comes back once the
    // column exists (see INVITE_NAME_SQL) without breaking the read before it does.
    let q = db
      .from('team_invites')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('status', 'pending');
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    // Never hand the single-use accept token back to the browser.
    const invites = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id, email: r.email, name: (r.name as string | null | undefined) ?? null, role: r.role,
      project_id: r.project_id ?? null, created_at: r.created_at, invited_by: r.invited_by,
    }));
    return NextResponse.json({ invites });
  } catch (e) {
    // A failed read must not look like "no pending invites".
    return apiError('team/invite', e, 'Could not load pending invites');
  }
}

/**
 * POST /api/team/invite
 *
 * Accepts BOTH call shapes used in the app:
 *   { email, name?, role?, projectId? }                  — single invite (project team page)
 *   { invites: [{ email, name?, role? }], projectId? }   — batch (onboarding step 4)
 *
 * Every invite is a real team_invites row + a real email. Nothing is ever
 * reported as sent unless the row was written; a failure comes back as
 * status:'failed' with the actual reason. There is no invite queue in this
 * codebase, so no invite is ever reported as 'queued'.
 */
export async function POST(req: NextRequest) {
  // Inviting a teammate expands who can access the tenant — access-control action.
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({}));
    const { email, name, role = 'member', projectId } = body;
    const batch = body?.invites;

    // ── Batch shape ────────────────────────────────────────────────────────────
    if (Array.isArray(batch)) {
      const entries = batch.filter((i: { email?: string }) => i?.email?.trim());
      if (entries.length === 0) {
        return NextResponse.json({ error: 'At least one email address is required.' }, { status: 400 });
      }
      const results: Array<{ email: string; status: 'sent' | 'failed'; error?: string }> = [];
      for (const entry of entries) {
        const r = await createAndSendInvite(user, {
          email: String(entry.email).trim(),
          name: entry.name,
          role: entry.role || 'member',
          projectId,
        });
        results.push(r.ok
          ? { email: r.email, status: 'sent' }
          : { email: r.email, status: 'failed', error: r.error });
      }
      const sent = results.filter(r => r.status === 'sent').length;
      const failed = results.length - sent;
      if (sent === 0) {
        return NextResponse.json(
          { success: false, sent, failed, results, error: results[0]?.error || 'No invites could be sent.' },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: failed === 0, sent, failed, results });
    }

    // ── Single shape ───────────────────────────────────────────────────────────
    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }
    const single = await createAndSendInvite(user, { email, name, role, projectId });
    if (!single.ok) {
      return NextResponse.json({ error: single.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, invite: single.invite, acceptUrl: single.acceptUrl });
  } catch (err) {
    console.error('[team/invite] POST failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

type InviteInput = { email: string; name?: string; role?: string; projectId?: string };
type InviteResult =
  | { ok: true; email: string; invite: unknown; acceptUrl: string }
  | { ok: false; email: string; error: string };

/**
 * Creates one team_invites row and sends its invitation email.
 * Returns ok:false with the real DB/email reason rather than throwing, so a
 * batch can report per-recipient truth instead of one blanket success.
 */
async function createAndSendInvite(
  user: { id: string; email?: string | null; tenantId: string },
  { email, name, role = 'member', projectId }: InviteInput,
): Promise<InviteResult> {
  try {
    const db = createServerClient();
    const tenantId = user.tenantId;

    // Secure, single-use accept token (persisted so the invitee can actually accept).
    const token = randomBytes(24).toString('hex');

    // Insert the real team_invites columns, plus `name` as an OPTIONAL column:
    // until the migration above runs, a "no such column" answer drops just the
    // name and retries, so the invite itself is never lost over it. We store
    // the token so the invite is real, and surface any other DB error honestly.
    const cleanName = typeof name === 'string' && name.trim() && name.trim().toLowerCase() !== String(email).toLowerCase()
      ? name.trim() : null;
    const { result: { data: invite, error: insertErr } } = await writeWithOptionalColumns(
      {
        tenant_id: tenantId,
        email,
        role,
        project_id: projectId || null,
        invited_by: user.id,
        token,
        status: 'pending',
        created_at: new Date().toISOString(),
        name: cleanName,
      },
      ['name'],
      // `as never`: the generated types predate team_invites.name (optional above).
      (row) => db.from('team_invites').insert(row as never).select().single(),
    );

    if (insertErr || !invite) {
      console.error('[team/invite] insert failed for', email, '-', insertErr?.message);
      return { ok: false, email, error: insertErr?.message || 'Failed to create invite' };
    }

    const acceptUrl = `${APP_URL}/accept-invite?token=${token}`;

    // Best-effort lookup of inviter name + company for the email body.
    let inviterName = user.email || 'A teammate';
    let companyName = 'your team';
    try {
      const { data: profile } = await db
        .from('profiles')
        .select('full_name, first_name, company')
        .eq('id', user.id)
        .single();
      if (profile) {
        inviterName = (profile as any).full_name || (profile as any).first_name || inviterName;
        companyName = (profile as any).company || companyName;
      }
    } catch { /* non-fatal — fall back to defaults */ }

    // Send the real invitation email (no-ops gracefully if RESEND_API_KEY is unset).
    await sendInviteTeamMember(email, inviterName, companyName, role, acceptUrl);

    // In-app notification for the inviter's org.
    await createNotification(
      tenantId,
      user.id,
      'sub_added',
      `Team invite sent to ${name || email}`,
      `${email} has been invited to join your team as ${role}.`,
      projectId
        ? `${APP_URL}/app/projects/${projectId}/team`
        : `${APP_URL}/app`,
    );

    return { ok: true, email, invite, acceptUrl };
  } catch (err) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[team/invite]', err);
    const msg = "Invite failed";
    console.error('[team/invite] invite threw for', email, '-', msg);
    return { ok: false, email, error: msg };
  }
}
