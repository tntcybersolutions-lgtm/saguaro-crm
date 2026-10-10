import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    /* A refused read must throw, not resolve to []: the Roles screen re-seeds
       the six built-ins when this list comes back empty, so a silent failure
       here would both hide every saved role and write duplicates. */
    const { data: roles, error: rErr } = await supabase.from('role_definitions').select('*').eq('tenant_id', user.tenantId).order('name');
    if (rErr) throw rErr;
    const { data: assignments, error: aErr } = await supabase.from('user_role_assignments').select('*').eq('tenant_id', user.tenantId);
    if (aErr) throw aErr;
    return NextResponse.json({ roles: roles ?? [], assignments: assignments ?? [] });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no roles" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('roles', e, 'Could not load roles');
  }
}

export async function POST(req: NextRequest) {
  // Creating role definitions or assigning roles is an access-control action.
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  let what = 'role';
  try {
    const supabase = createServerClient();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Send the role details as JSON.' }, { status: 400 });
    }
    if (body._type === 'assignment') {
      what = 'role assignment';
      const userId = body.user_id ?? body.userId;
      const roleId = body.role_id ?? body.roleId;
      const projectId = (body.project_id ?? body.projectId) || null;
      if (!userId || !roleId) {
        return NextResponse.json({ error: 'user_id and role_id are required' }, { status: 400 });
      }
      // The role, the person and the job all come from the browser: each must be
      // this company's, or one company could hand out another company's role.
      const [{ data: role }, { data: member }, { data: job }] = await Promise.all([
        supabase.from('role_definitions').select('id').eq('id', roleId).eq('tenant_id', user.tenantId).maybeSingle(),
        supabase.from('profiles').select('id').eq('id', userId).eq('tenant_id', user.tenantId).maybeSingle(),
        projectId
          ? supabase.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle()
          : Promise.resolve({ data: { id: null } }),
      ]);
      if (!role) return NextResponse.json({ error: 'That role is not one of this company\'s roles.' }, { status: 404 });
      if (!member) return NextResponse.json({ error: 'That person is not on this company\'s team.' }, { status: 404 });
      if (!job) return NextResponse.json({ error: 'That job is not one of this company\'s jobs.' }, { status: 404 });
      const { data, error } = await supabase.from('user_role_assignments').insert({
        tenant_id: user.tenantId, user_id: userId, project_id: projectId,
        role_id: roleId, assigned_by: user.id,
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ assignment: data }, { status: 201 });
    }
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const { data, error } = await supabase.from('role_definitions').insert({
      tenant_id: user.tenantId, name: body.name, description: body.description || null,
      permissions: body.permissions || {}, color: body.color || null,
      is_builtin: !!body.is_builtin, is_default: !!body.is_default,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ role: data }, { status: 201 });
  } catch (e) {
    return apiError('roles POST', e, `Could not save the ${what}. Please try again.`);
  }
}
