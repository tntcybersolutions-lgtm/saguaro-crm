import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { sendInviteTeamMember } from '@/lib/email';
import { apiError, apiFail } from '@/lib/api-error';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/**
 * DELETE /api/team/invite/[id]
 * Cancel a pending invite. Tenant-scoped: the invite MUST belong to the caller's
 * tenant (the `.eq('tenant_id', ...)` filter makes a cross-tenant cancel a no-op).
 * We soft-cancel (status='cancelled') rather than hard-delete so the record stays
 * auditable.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Cancelling an invite changes who can access the tenant — access-control action.
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('team_invites')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('team/invite DELETE', e, "Couldn't cancel the invite. Please try again.");
  }
}

/**
 * PATCH /api/team/invite/[id]  { name?, role? }
 * Correct a pending invite before it is accepted — the name it was sent under
 * and the role the person gets when they accept. The address is not editable
 * here (the link already went to it): cancel and invite the right address.
 * Tenant-scoped; only a pending invite can change. Never returns the token.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The role on an invite becomes the person's access when they accept — access-control action.
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, string | null> = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim();
      if (name.length > 120) return apiFail('name: keep it under 120 characters.', 400);
      patch.name = name || null;
    }
    if (body.role !== undefined) {
      const role = String(body.role ?? '').trim();
      if (!role) return apiFail('role: choose the role they get when they accept.', 400);
      if (role.length > 60) return apiFail('role: keep it under 60 characters.', 400);
      patch.role = role;
    }
    if (!Object.keys(patch).length) return apiFail('Send the name or role to change.', 400);
    const db = createServerClient();
    const { data, error } = await db
      .from('team_invites')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .eq('status', 'pending')
      .select('id, email, name, role, project_id, created_at, invited_by')
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiFail('That invite is not pending any more (accepted or cancelled).', 404);
    return NextResponse.json({ invite: data });
  } catch (e) {
    return apiError('team/invite PATCH', e, "Couldn't save the invite. Please try again.");
  }
}

/**
 * POST /api/team/invite/[id]
 * Resend a pending invite: re-send the invitation email and reset the 7-day clock
 * (created_at = now) so the countdown restarts. The token is intentionally kept
 * the same so any prior copy of the link still works. Tenant-scoped throughout.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();

    // Load the invite — MUST belong to this tenant (never touch another tenant's row).
    const { data: invite, error: findErr } = await db
      .from('team_invites')
      .select('id, email, role, token')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (findErr || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    // Reset the 7-day clock and keep it pending (same token — no regeneration).
    const { error: updErr } = await db
      .from('team_invites')
      .update({ created_at: new Date().toISOString(), status: 'pending' })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (updErr) throw updErr;

    const acceptUrl = `${APP_URL}/accept-invite?token=${invite.token}`;

    // Best-effort inviter name + company for the email body (mirrors the send route).
    let inviterName = user.email || 'A teammate';
    let companyName = 'your team';
    try {
      const { data: profile } = await db
        .from('profiles')
        .select('full_name, first_name, company')
        .eq('id', user.id)
        .single();
      if (profile) {
        inviterName = (profile as any).full_name || (profile as any).first_name || inviterName; // eslint-disable-line @typescript-eslint/no-explicit-any
        companyName = (profile as any).company || companyName; // eslint-disable-line @typescript-eslint/no-explicit-any
      }
    } catch { /* non-fatal — fall back to defaults */ }

    // Re-send the real invitation email (no-ops gracefully if RESEND_API_KEY is unset).
    await sendInviteTeamMember(invite.email, inviterName, companyName, invite.role || 'member', acceptUrl);

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('team/invite resend', e, "Couldn't resend the invite. Please try again.");
  }
}
