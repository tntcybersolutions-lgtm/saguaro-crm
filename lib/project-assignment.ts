/**
 * Hand a project to a signed-in team member.
 *
 * Shared by POST /api/projects/assign (Customers → Assign) and
 * PATCH /api/projects/[projectId] (the "Assigned to" control on a project's
 * overview and Team page). Before this existed the only way to put a person on
 * an EXISTING job was the Customers page, which only works for projects linked
 * to a customer, or a Work Assignment, which is locked until an email invite
 * is accepted.
 *
 * Assignment grants real access three ways, all tenant-scoped and idempotent:
 *   1. projects.assigned_to (+ assigned_to_name) — the assignee of record.
 *   2. work_assignments — puts the job in the assignee's My Work hub.
 *   3. user_role_assignments — a project-scoped "Project Manager" grant, which
 *      is what getEffectivePermissions() reads (best effort: skipped when the
 *      tenant has no such role).
 * The assignee gets an in-app notification (no email).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createNotification } from '@/lib/notifications';
import { logActivity } from '@/lib/activity';

type Db = SupabaseClient<Database>;

export type AssignResult =
  | { ok: true; assigneeName: string | null; documentsAccessGranted: boolean }
  | { ok: false; reason: 'not_member' };

export async function assignProjectToUser(
  db: Db,
  args: {
    tenantId: string;
    projectId: string;
    projectName: string;
    assigneeUserId: string;
    actor: { id: string; email: string };
  },
): Promise<AssignResult> {
  const { tenantId, projectId, projectName, assigneeUserId, actor } = args;

  // Assignee must be a real member of this tenant.
  const { data: assignee, error: profErr } = await db
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', assigneeUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (profErr) throw profErr;
  if (!assignee) return { ok: false, reason: 'not_member' };
  const assigneeName = assignee.full_name || assignee.email || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any;

  // 1) Project's assignee of record.
  const { error: updErr } = await anyDb
    .from('projects')
    .update({ assigned_to: assigneeUserId, assigned_to_name: assigneeName } as never)
    .eq('id', projectId)
    .eq('tenant_id', tenantId);
  if (updErr) throw updErr;

  // 2) work_assignments — honor UNIQUE (tenant_id, project_id, assignee_user_id,
  //    role): reactivate an ended row rather than duplicate-key insert.
  const ROLE = 'project_manager';
  const { data: existingWa, error: waFindErr } = await anyDb
    .from('work_assignments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('assignee_user_id', assigneeUserId)
    .eq('role', ROLE)
    .maybeSingle();
  if (waFindErr) throw waFindErr;

  if (existingWa) {
    const { error: waUpdErr } = await anyDb
      .from('work_assignments')
      .update({
        status: 'active',
        ended_at: null,
        scope: 'full',
        assignee_name: assigneeName,
        assigned_by: actor.id,
        assigned_by_name: actor.email,
      } as never)
      .eq('id', (existingWa as { id: string }).id)
      .eq('tenant_id', tenantId);
    if (waUpdErr) throw waUpdErr;
  } else {
    const { error: waErr } = await anyDb.from('work_assignments').insert({
      tenant_id: tenantId,
      project_id: projectId,
      assignee_user_id: assigneeUserId,
      assignee_name: assigneeName,
      role: ROLE,
      scope: 'full',
      status: 'active',
      assigned_by: actor.id,
      assigned_by_name: actor.email,
    } as never);
    if (waErr) throw waErr;
  }

  // 3) Project-scoped "Project Manager" role grant (best effort).
  let documentsAccessGranted = false;
  const { data: pmRole } = await db
    .from('role_definitions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', 'Project Manager')
    .maybeSingle();

  if (pmRole?.id) {
    const { data: existingGrant } = await db
      .from('user_role_assignments')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', assigneeUserId)
      .eq('project_id', projectId)
      .eq('role_id', pmRole.id)
      .maybeSingle();

    if (!existingGrant) {
      const { error: graErr } = await db.from('user_role_assignments').insert({
        tenant_id: tenantId,
        user_id: assigneeUserId,
        project_id: projectId,
        role_id: pmRole.id,
        assigned_by: actor.id,
      } as never);
      if (graErr) throw graErr;
    }
    documentsAccessGranted = true;
  }

  // Tell the assignee — in-app only, never blocks the assignment.
  if (assigneeUserId !== actor.id) {
    createNotification(
      tenantId,
      assigneeUserId,
      'work_assigned',
      'Project assigned to you',
      `${projectName} — Project Manager`,
      `/app/projects/${projectId}/overview`,
      projectId,
    ).catch((err) => console.error('[project-assignment] notify', err));
  }

  void logActivity({
    tenantId,
    projectId,
    userId: actor.id,
    userName: actor.email,
    action: 'assigned',
    entityType: 'project',
    entityId: projectId,
    description: `Assigned ${assigneeName ?? 'a team member'} to ${projectName}`,
    metadata: { assigneeUserId },
  });

  return { ok: true, assigneeName, documentsAccessGranted };
}
