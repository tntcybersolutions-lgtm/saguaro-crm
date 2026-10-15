/**
 * Give an invitee the permissions of the role they were invited as.
 *
 * The invite form lists the company's roles (role_definitions), and the chosen
 * name was saved only as text on profiles.role. Permissions are read from
 * user_role_assignments (lib/permissions.ts), so every invitee who was not an
 * admin/owner landed with the bare member default: view-only, unable to do the
 * job they were invited for. Ben joined Copper State as "Salesperson" (Sales:
 * Full) and could not add a lead.
 *
 * This looks the role name up in the inviting company's role_definitions and
 * writes the assignment (company-wide, or on the invite's job). A role name with
 * no definition (e.g. "member") grants nothing extra. Never throws: the account
 * already exists at this point, so a failure is logged and reported back.
 */
import type { createServerClient } from '@/lib/supabase-server';

type Db = ReturnType<typeof createServerClient>;

export async function grantInvitedRole(
  db: Db,
  args: { tenantId: string; userId: string; role: string | null | undefined; projectId?: string | null; assignedBy?: string | null },
): Promise<{ granted: boolean; roleId?: string; error?: string }> {
  const name = String(args.role || '').trim();
  if (!name) return { granted: false };
  try {
    const { data: defs, error: defErr } = await db
      .from('role_definitions')
      .select('id, name')
      .eq('tenant_id', args.tenantId);
    if (defErr) throw defErr;
    const match = (defs ?? []).find(d => String(d.name || '').trim().toLowerCase() === name.toLowerCase());
    if (!match) return { granted: false };

    const projectId = args.projectId || null;
    let existingQ = db
      .from('user_role_assignments')
      .select('id')
      .eq('tenant_id', args.tenantId)
      .eq('user_id', args.userId)
      .eq('role_id', match.id);
    existingQ = projectId ? existingQ.eq('project_id', projectId) : existingQ.is('project_id', null);
    const { data: existing, error: exErr } = await existingQ.limit(1);
    if (exErr) throw exErr;
    if (existing && existing.length) return { granted: true, roleId: match.id };

    const { error: insErr } = await db.from('user_role_assignments').insert({
      tenant_id: args.tenantId,
      user_id: args.userId,
      role_id: match.id,
      project_id: projectId,
      assigned_by: args.assignedBy || null,
    });
    if (insErr) throw insErr;
    return { granted: true, roleId: match.id };
  } catch (e) {
    console.error('[invite-role] could not grant role', name, 'to', args.userId, e);
    return { granted: false, error: 'role grant failed' };
  }
}

/**
 * Look an invite up by its emailed token, following a re-send.
 *
 * Sending a new invite to the same address cancels the older one, but the
 * older email is still in the person's inbox. Its link used to open a normal
 * "Join" page and then fail on submit with "already used — sign in", sending
 * someone with no account to a sign-in they could not complete. The old token
 * was delivered to the same address, so it is the same proof of ownership:
 * a cancelled invite resolves to the newest pending invite for the same
 * company, email and job. With no newer one it stays cancelled.
 */
export async function findInviteByToken(db: Db, token: string) {
  const first = await db.from('team_invites').select('*').eq('token', token).maybeSingle();
  if (first.error || !first.data) return first;
  const row = first.data as { status?: string | null; tenant_id: string; email?: string | null; project_id?: string | null };
  if (row.status !== 'cancelled' || !row.email) return first;
  const pattern = String(row.email).replace(/[\\%_]/g, (c) => `\\${c}`);
  let q = db.from('team_invites').select('*')
    .eq('tenant_id', row.tenant_id).eq('status', 'pending').ilike('email', pattern);
  q = row.project_id ? q.eq('project_id', row.project_id) : q.is('project_id', null);
  const { data: newer, error } = await q.order('created_at', { ascending: false }).limit(1);
  if (error) { console.error('[invite] newer-invite lookup failed', error); return first; }
  return newer && newer.length ? { data: newer[0], error: null } : first;
}
