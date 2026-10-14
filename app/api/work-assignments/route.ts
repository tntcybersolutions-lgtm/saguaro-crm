import { NextRequest, NextResponse } from 'next/server';
import {
  requirePermission,
  getEffectivePermissions,
  hasPermission,
} from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { runInBackground } from '@/lib/background';

/**
 * Work Routing Engine — project ownership assignments.
 *
 * work_assignments is the routing table: who owns which project, in what role.
 * The My Work hub (/api/my-work) fans out from these rows, so this route is the
 * single write path for putting a person on (or off) a project.
 *
 * GET  ?projectId=            -> active assignments for one project
 * GET  ?mine=1                -> the caller's active assignments across projects
 * POST { projectId, assigneeUserId, role, scope?, note? } -> upsert (reactivates ended rows)
 * POST { end: true, assignmentId }                        -> end an assignment
 */

/** 'project_manager' -> 'Project Manager' for human-facing copy. */
function humanizeRole(role: string): string {
  return String(role || '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const mine = req.nextUrl.searchParams.get('mine');

  const g = await requirePermission(req, 'Projects', 'View', {
    projectId: projectId || undefined,
  });
  if (!g.ok) return g.res;
  const t = g.user.tenantId;

  try {
    const db = createServerClient() as any;

    if (mine === '1' || mine === 'true') {
      // Caller's active assignments joined with the project header — the FK on
      // project_id lets PostgREST embed projects even though typegen is stale.
      const { data, error } = await db
        .from('work_assignments')
        .select('id, project_id, role, scope, note, status, created_at, projects(id, name, status)')
        .eq('tenant_id', t)
        .eq('assignee_user_id', g.user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const assignments = ((data || []) as any[]).map((a) => ({
        id: a.id,
        project_id: a.project_id,
        role: a.role,
        scope: a.scope,
        note: a.note,
        created_at: a.created_at,
        project: a.projects || null,
      }));
      return NextResponse.json({ assignments });
    }

    if (!projectId) {
      return NextResponse.json({ error: 'projectId or mine=1 required' }, { status: 400 });
    }

    const { data, error } = await db
      .from('work_assignments')
      .select('id, assignee_user_id, assignee_name, role, scope, note, created_at')
      .eq('tenant_id', t)
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ assignments: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as any));

  /* ── end an assignment ─────────────────────────────────────────────── */
  if (b.end === true) {
    if (!b.assignmentId) {
      return NextResponse.json({ error: 'assignmentId required' }, { status: 400 });
    }
    // Authenticate at View, then check Edit against the assignment's own
    // project so project-scoped role grants count (the projectId isn't known
    // until the row is loaded).
    const g = await requirePermission(req, 'Projects', 'View');
    if (!g.ok) return g.res;
    try {
      const db = createServerClient() as any;
      const { data: row } = await db
        .from('work_assignments')
        .select('id, project_id')
        .eq('id', b.assignmentId)
        .eq('tenant_id', g.user.tenantId)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

      const perms = await getEffectivePermissions(
        db, g.user.id, g.user.tenantId, (row as any).project_id,
      );
      if (!hasPermission(perms, 'Projects', 'Edit')) {
        return NextResponse.json(
          { error: 'Forbidden', detail: 'Requires Projects ≥ Edit' },
          { status: 403 },
        );
      }

      const { error } = await db
        .from('work_assignments')
        .update({ status: 'ended', ended_at: new Date().toISOString() } as never)
        .eq('id', b.assignmentId)
        .eq('tenant_id', g.user.tenantId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  /* ── create / reactivate an assignment ─────────────────────────────── */
  if (!b.projectId || !b.assigneeUserId) {
    return NextResponse.json({ error: 'projectId and assigneeUserId required' }, { status: 400 });
  }
  const role = String(b.role || 'project_manager').trim() || 'project_manager';
  const scope = String(b.scope || 'full').trim() || 'full';
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null;

  const g = await requirePermission(req, 'Projects', 'Edit', { projectId: b.projectId });
  if (!g.ok) return g.res;
  const t = g.user.tenantId;

  try {
    const db = createServerClient() as any;

    // Project must exist inside the tenant — also feeds the notification copy.
    const { data: project } = await db
      .from('projects')
      .select('id, name')
      .eq('id', b.projectId)
      .eq('tenant_id', t)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Resolve assignee display name: project roster first, then profile.
    let assigneeName: string | null = null;
    const { data: teamRow } = await db
      .from('project_team')
      .select('name, email')
      .eq('tenant_id', t)
      .eq('project_id', b.projectId)
      .eq('user_id', b.assigneeUserId)
      .maybeSingle();
    if (teamRow?.name) assigneeName = teamRow.name;
    if (!assigneeName) {
      const { data: prof } = await db
        .from('profiles')
        .select('full_name, preferred_name, first_name, email')
        .eq('tenant_id', t).eq('id', b.assigneeUserId)
        .maybeSingle();
      assigneeName =
        prof?.full_name || prof?.preferred_name || prof?.first_name ||
        prof?.email || teamRow?.email || null;
    }

    // Who is assigning — stamp for the audit trail on the row.
    const { data: callerProf } = await db
      .from('profiles')
      .select('full_name, preferred_name, first_name')
      .eq('id', g.user.id)
      .maybeSingle();
    const assignedByName =
      callerProf?.full_name || callerProf?.preferred_name ||
      callerProf?.first_name || g.user.email || null;

    // Upsert honoring UNIQUE (tenant_id, project_id, assignee_user_id, role):
    // an ended row for the same tuple is reactivated in place, an active one is
    // refreshed — never a duplicate-key insert.
    const { data: existing } = await db
      .from('work_assignments')
      .select('id, status')
      .eq('tenant_id', t)
      .eq('project_id', b.projectId)
      .eq('assignee_user_id', b.assigneeUserId)
      .eq('role', role)
      .maybeSingle();

    let assignment: any = null;
    if (existing) {
      const { data, error } = await db
        .from('work_assignments')
        .update({
          status: 'active',
          ended_at: null,
          scope,
          note,
          assignee_name: assigneeName,
          assigned_by: g.user.id,
          assigned_by_name: assignedByName,
        } as never)
        .eq('id', (existing as any).id)
        .eq('tenant_id', t)
        .select()
        .single();
      if (error) throw error;
      assignment = data;
    } else {
      const { data, error } = await db
        .from('work_assignments')
        .insert({
          tenant_id: t,
          project_id: b.projectId,
          assignee_user_id: b.assigneeUserId,
          assignee_name: assigneeName,
          role,
          scope,
          note,
          status: 'active',
          assigned_by: g.user.id,
          assigned_by_name: assignedByName,
        } as never)
        .select()
        .single();
      if (error) throw error;
      assignment = data;
    }

    // Tell the assignee their queue changed — never block the response on it.
    runInBackground(createNotification(
      t,
      b.assigneeUserId,
      'work_assigned',
      'Project assigned to you',
      `${(project as any).name} — ${humanizeRole(role)}`,
      '/app/my-work',
      b.projectId,
    ), 'notify assignee');

    return NextResponse.json({ assignment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
