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
