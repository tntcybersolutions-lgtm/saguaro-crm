import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { createNotification } from '@/lib/notifications';
import { sendInviteTeamMember } from '@/lib/email';
import { apiError } from '@/lib/api-error';
import { writeWithOptionalColumns } from '@/lib/optional-column';

/* The invitee's name. team_invites had no `name` column, so the name typed on
   the invite form was thrown away and the roster could only show an email. The
   column exists now (supabase/migrations/20261010_team_invite_name_radio_edited_at.sql);
   the insert still sends it as an OPTIONAL column (dropped and retried only if
   the database says the column is missing), so a database without that
   migration keeps the invite itself.                                          */

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
    // `*` rather than a column list, so a database without the `name` column
    // still answers (the name then reads as null).
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
      const results: Array<{ email: string; status: 'sent' | 'failed'; error?: string; emailed?: boolean }> = [];
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
        // 'sent' = the invite exists; `emailed` says whether its email went out.
        results.push(r.ok
          ? { email: r.email, status: 'sent', emailed: r.emailed, ...(r.emailed ? {} : { error: r.emailError }) }
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
    /* `emailed` is the truth about the email: the invite row exists either way
       (the accept link works), but "Invitation sent" must not be said when no
       mail went out — no RESEND_API_KEY, or the mail service refused it. */
    return NextResponse.json({ success: true, invite: single.invite, acceptUrl: single.acceptUrl, emailed: single.emailed, ...(single.emailed ? {} : { emailError: single.emailError }) });
  } catch (err) {
    return apiError('team/invite POST', err, "Couldn't send the invite. Please try again.");
  }
}

type InviteInput = { email: string; name?: string; role?: string; projectId?: string };
type InviteResult =
  | { ok: true; email: string; invite: unknown; acceptUrl: string; emailed: boolean; emailError?: string }
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
    // on a database without it, a "no such column" answer drops just the name
    // and retries, so the invite itself is never lost over it. We store
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
      // The database's words stay in the log; the caller gets ours.
      console.error('[team/invite] insert failed for', email, '-', insertErr?.message);
      return { ok: false, email, error: "Couldn't create the invite. Please try again." };
    }

    // One live invite per address (per job, or company-wide): once the new one
    // is saved, it replaces any older pending invite to the same email instead
    // of stacking beside it, so People shows — and Edit opens — the one just sent.
    // Escape ilike's wildcards so "a_b@x.com" matches only itself.
    const emailPattern = String(email).replace(/[\\%_]/g, (c) => `\\${c}`);
    let older = db.from('team_invites').update({ status: 'cancelled' } as never)
      .eq('tenant_id', tenantId).neq('id', (invite as { id: string }).id).eq('status', 'pending').ilike('email', emailPattern);
    older = projectId ? older.eq('project_id', projectId) : older.is('project_id', null);
    const { error: supersedeErr } = await older;
    if (supersedeErr) console.error('[team/invite] could not retire the older invite for', email, '-', supersedeErr.message);

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

    // Send the real invitation email, and keep the answer: it may not go out.
    const mail = await sendInviteTeamMember(email, inviterName, companyName, role, acceptUrl);

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

    return { ok: true, email, invite, acceptUrl, emailed: mail.sent, emailError: mail.sent ? undefined : (mail.error || "The email didn't go out.") };
  } catch (err) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[team/invite]', err);
    const msg = "Invite failed";
    console.error('[team/invite] invite threw for', email, '-', msg);
    return { ok: false, email, error: msg };
  }
}
