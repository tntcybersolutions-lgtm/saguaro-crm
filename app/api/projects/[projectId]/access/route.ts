import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, resolvePermissions, CATEGORIES, type AssignmentRow, type PermissionMap } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { logActivity } from '@/lib/activity';
import { isUuid } from '@/lib/permission-scope';
import { describeJobRow, NO_ACCESS_LEVELS, type JobAccessPerson, type JobAccessMode } from '@/lib/job-access';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['admin', 'owner']);

type Ura = AssignmentRow & { id: string; user_id: string };

/**
 * GET /api/projects/[projectId]/access — every person in the company and what
 * they can do on THIS job: their company role, their job role (if one is set)
 * and the level per category that actually applies here (resolvePermissions,
 * the same function every guard uses).
 *
 * Anyone who can see the job can read it; changing it (PUT) is a company
 * admin's action (Admin: Full).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Projects', 'View', { projectId });
  if (!g.ok) return g.res;
  const { user, db, perms } = g;

  try {
    const [profilesRes, urasRes, rolesRes] = await Promise.all([
      db.from('profiles').select('id, full_name, email, role').eq('tenant_id', user.tenantId),
      db.from('user_role_assignments').select('*').eq('tenant_id', user.tenantId),
      db.from('role_definitions').select('id, name, color, permissions').eq('tenant_id', user.tenantId).order('name', { ascending: true }),
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (urasRes.error) throw urasRes.error;
    if (rolesRes.error) throw rolesRes.error;

    const roleRows = rolesRes.data ?? [];
    const roles = new Map<string, unknown>(roleRows.map((r) => [r.id, r.permissions]));
    const roleName = new Map<string, string>(roleRows.map((r) => [r.id, r.name]));
    const uras = (urasRes.data ?? []) as unknown as Ura[];

    const people: JobAccessPerson[] = (profilesRes.data ?? []).map((p) => {
      const mine = uras.filter((a) => a.user_id === p.id);
      const isAdmin = ADMIN_ROLES.has(String(p.role || '').toLowerCase());
      const globalNames = mine.filter((a) => a.project_id == null && a.role_id).map((a) => roleName.get(a.role_id!) ?? 'Removed role');
      const jobRow = mine.find((a) => a.project_id === projectId) ?? null;
      const effective: PermissionMap = resolvePermissions({ baseRole: p.role, assignments: mine, roles, projectId });
      const job = describeJobRow(jobRow, roleName);
      return {
        userId: p.id,
        name: p.full_name || p.email || 'Team member',
        email: p.email || '',
        isAdmin,
        companyRole: isAdmin ? 'Admin' : globalNames.length ? globalNames.join(', ') : 'Member',
        job,
        effective,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      canManage: perms.Admin === 'Full',
      categories: CATEGORIES,
      roles: roleRows.map((r) => ({ id: r.id, name: r.name, color: r.color ?? null })),
      people,
    });
  } catch (e) {
    return apiError('projects/access GET', e, 'Could not load who can work on this job');
  }
}

/**
 * PUT /api/projects/[projectId]/access
 * Body: { userId, access: 'company' | 'none' | <role id> }
 *   company → remove the job role (the company role applies here again)
 *   none    → no access on this job
 *   role id → that role on this job only
 * One job row per person per job (ura_one_job_row).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Admin', 'Full', { projectId });
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const userId = String(body.userId ?? body.user_id ?? '');
    const access = String(body.access ?? '');
    if (!isUuid(userId)) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    if (!access) return NextResponse.json({ error: 'access is required' }, { status: 400 });

    const { data: person, error: pErr } = await db
      .from('profiles').select('id, full_name, email, role').eq('id', userId).eq('tenant_id', user.tenantId).maybeSingle();
    if (pErr) throw pErr;
    if (!person) return NextResponse.json({ error: 'That person is not in your company' }, { status: 404 });
    if (ADMIN_ROLES.has(String(person.role || '').toLowerCase())) {
      return NextResponse.json({ error: 'Admins have full access on every job.' }, { status: 400 });
    }

    let mode: JobAccessMode;
    let roleId: string | null = null;
    let levels: Record<string, string> | null = null;
    let label: string;
    if (access === 'company') {
      mode = 'company';
      label = 'company role';
    } else if (access === 'none') {
      mode = 'none';
      levels = NO_ACCESS_LEVELS;
      label = 'no access';
    } else {
      if (!isUuid(access)) return NextResponse.json({ error: 'access must be company, none or a role id' }, { status: 400 });
      const { data: role, error: rErr } = await db
        .from('role_definitions').select('id, name').eq('id', access).eq('tenant_id', user.tenantId).maybeSingle();
      if (rErr) throw rErr;
      if (!role) return NextResponse.json({ error: 'That role is not in your company' }, { status: 404 });
      mode = 'role';
      roleId = role.id;
      label = role.name;
    }

    const { data: existing, error: eErr } = await db
      .from('user_role_assignments')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .eq('user_id', userId)
      .eq('project_id', projectId);
    if (eErr) throw eErr;
    const ids = (existing ?? []).map((r) => r.id);

    if (mode === 'company') {
      if (ids.length) {
        const { error } = await db.from('user_role_assignments').delete().eq('tenant_id', user.tenantId).in('id', ids);
        if (error) throw error;
      }
    } else if (ids.length) {
      const { error } = await db
        .from('user_role_assignments')
        .update({ role_id: roleId, permissions: levels, assigned_by: user.id })
        .eq('tenant_id', user.tenantId)
        .eq('id', ids[0]);
      if (error) throw error;
      if (ids.length > 1) {
        const { error: dErr } = await db.from('user_role_assignments').delete().eq('tenant_id', user.tenantId).in('id', ids.slice(1));
        if (dErr) throw dErr;
      }
    } else {
      const { error } = await db.from('user_role_assignments').insert({
        tenant_id: user.tenantId,
        user_id: userId,
        project_id: projectId,
        role_id: roleId,
        permissions: levels,
        assigned_by: user.id,
      });
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return NextResponse.json({ error: 'Someone else just set this person’s job role. Reload and try again.' }, { status: 409 });
        }
        throw error;
      }
    }

    void logActivity({
      tenantId: user.tenantId,
      projectId,
      userId: user.id,
      userName: user.email,
      action: 'access_changed',
      entityType: 'project',
      entityId: projectId,
      description: `Set ${person.full_name || person.email || 'a team member'} to ${label} on this job`,
      metadata: { userId, access: mode, roleId },
    });

    return NextResponse.json({ success: true, userId, access: mode, roleId });
  } catch (e) {
    return apiError('projects/access PUT', e, 'Could not change this person’s access to the job');
  }
}
