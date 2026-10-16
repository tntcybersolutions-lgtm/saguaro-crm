import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

/**
 * GET /api/roles/assignments
 * Returns a bare array of user role assignments (camelCase) for the
 * roles-permissions admin page. Names are denormalized from related
 * tables where available, with safe fallbacks.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();

    const { data: assignments } = await db
      .from('user_role_assignments')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    const rows = assignments ?? [];
    if (rows.length === 0) return NextResponse.json([]);

    // Resolve display names from related tables (best effort).
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const roleIds = Array.from(new Set(rows.map((r) => r.role_id).filter(Boolean)));
    const projectIds = Array.from(new Set(rows.map((r) => r.project_id).filter(Boolean)));
    const assignerIds = Array.from(new Set(rows.map((r) => r.assigned_by).filter(Boolean))) as string[];
    const lookupIds = Array.from(new Set([...userIds, ...assignerIds]));

    const userMap = new Map<string, { name: string; email: string }>();
    if (lookupIds.length > 0) {
      const { data: profiles } = await db
        .from('profiles')
        .select('id, full_name, email')
        .eq('tenant_id', user.tenantId).in('id', lookupIds);
      for (const p of profiles ?? []) {
        userMap.set(p.id, { name: p.full_name ?? p.email ?? 'Unknown', email: p.email ?? '' });
      }
    }

    const roleMap = new Map<string, string>();
    if (roleIds.length > 0) {
      const { data: roleDefs } = await db
        .from('role_definitions')
        .select('id, name')
        .eq('tenant_id', user.tenantId)
        .in('id', roleIds as string[]);
      for (const r of roleDefs ?? []) roleMap.set(r.id, r.name);
    }

    const projectMap = new Map<string, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await db
        .from('projects')
        .select('id, name')
        .eq('tenant_id', user.tenantId)
        .in('id', projectIds as string[]);
      for (const p of projects ?? []) projectMap.set(p.id, p.name);
    }

    const result = rows.map((r) => {
      const u = userMap.get(r.user_id);
      return {
        id: r.id,
        userId: r.user_id,
        userName: u?.name ?? 'Unknown',
        email: u?.email ?? '',
        roleId: r.role_id,
        roleName: roleMap.get(r.role_id!) ?? null,
        projectId: r.project_id ?? null,
        projectName: r.project_id ? projectMap.get(r.project_id) ?? null : null,
        assignedAt: r.created_at,
        assignedBy: r.assigned_by ? userMap.get(r.assigned_by)?.name ?? 'System' : 'System',
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no role assignments" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('roles/assignments', e, 'Could not load role assignments');
  }
}

/**
 * POST /api/roles/assignments
 * Creates a user role assignment. The page sends a rich camelCase object;
 * only the FK columns that exist on user_role_assignments are persisted.
 */
export async function POST(req: NextRequest) {
  // Assigning a role to a user grants access — access-control action.
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const body = await req.json();

    const userId = body.userId ?? body.user_id;
    const roleId = body.roleId ?? body.role_id;
    const projectId = body.projectId ?? body.project_id ?? null;

    if (!userId || !roleId) {
      return NextResponse.json({ error: 'userId and roleId are required' }, { status: 400 });
    }

    const { data, error } = await db
      .from('user_role_assignments')
      .insert({
        tenant_id: user.tenantId,
        user_id: userId,
        role_id: roleId,
        project_id: projectId || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (e) {
    return apiError('roles/assignments POST', e);
  }
}
