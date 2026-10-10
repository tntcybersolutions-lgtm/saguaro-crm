import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('name');
    /* This used to answer a failed contacts read by reading project_team
       instead and returning 200. That was an error handler, not a "no rows
       here, look there" design: an empty contacts table returned [] and never
       reached it. So a real failure showed the job's signed-in team members as
       if they were its directory (owner, architect, engineers), and the
       project_team read's own error was dropped, which could turn a failure
       into an empty directory. The directory is contacts; a failed read is an
       error the page shows with a retry. */
    if (error) throw error;
    return NextResponse.json({ contacts: data || [] });
  } catch (e) {
    return apiError('projects/projectId/directory', e, 'Could not load the job directory. Please try again.');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const supabase = createServerClient();
    // Whitelist to REAL contacts columns (id, tenant_id, project_id, name, role,
    // company, phone, email, created_at). The previous version spread ...body (which
    // includes non-columns: type/title/company_id/role_on_project/permission_role/
    // address/insurance_expiry/member_ids), omitted tenant_id, and set created_by
    // (which doesn't exist on contacts) — so EVERY insert failed and the swallow
    // returned a fake `dir-…` id (contacts has 0 rows in prod).
    const record: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: params.projectId,
      name: String(body.name).trim(),
      role: body.role ?? body.title ?? body.role_on_project ?? null,
      company: body.company ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('contacts').insert(record as never).select().single();
    // Never fabricate a fake `dir-…` id — surface the real DB error instead.
    if (error) {
      console.error('[directory/POST]', error);
      return apiError('projects/projectId/directory', error, "Failed to create contact", 500);
    }
    return NextResponse.json({ contact: data });
  } catch (e) {
    return apiError('projects/projectId/directory POST', e, "Couldn't add that contact. Please try again.");
  }
}
