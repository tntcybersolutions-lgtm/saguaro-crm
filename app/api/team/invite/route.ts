import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { createNotification } from '@/lib/notifications';
import { sendInviteTeamMember } from '@/lib/email';

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
    const { data, error } = await db
      .from('team_invites')
      .select('id, email, role, created_at, invited_by')
      .eq('tenant_id', user.tenantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ invites: data ?? [] });
  } catch {
    return NextResponse.json({ invites: [] }, { status: 500 });
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        if (!EMAIL_RE.test(String(entry.email).trim())) {
          results.push({ email: String(entry.email).trim(), status: 'failed', error: 'Not a valid email address.' });
          continue;
        }
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
          // Every address malformed is the caller's to fix (400), not a server fault.
          { status: results.every(r => r.error === 'Not a valid email address.') ? 400 : 500 },
        );
      }
      return NextResponse.json({ success: failed === 0, sent, failed, results });
    }

    // ── Single shape ───────────────────────────────────────────────────────────
    if (!email || !String(email).trim()) {
      return NextResponse.json({ error: 'Enter the email address to send the invite to.' }, { status: 400 });
    }
    // An invite row and an email to a non-address helps no one — say so instead.
    if (!EMAIL_RE.test(String(email).trim())) {
      return NextResponse.json({ error: 'Enter a valid email address — the invite link is sent there.' }, { status: 400 });
    }
    const single = await createAndSendInvite(user, { email: String(email).trim(), name, role, projectId });
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

    // Insert using ONLY real team_invites columns. `name` is NOT a column on this
    // table — persisting it here previously caused the whole insert to fail while
    // the route still (wrongly) reported success. We store the token so the invite
    // is real, and surface any DB error honestly instead of swallowing it.
    const { data: invite, error: insertErr } = await db
      .from('team_invites')
      .insert({
        tenant_id: tenantId,
        email,
        role,
        project_id: projectId || null,
        invited_by: user.id,
        token,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr || !invite) {
      // The database's words stay in the log; the caller gets ours.
      console.error('[team/invite] insert failed for', email, '-', insertErr?.message);
      return { ok: false, email, error: "Couldn't create the invite. Please try again." };
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
