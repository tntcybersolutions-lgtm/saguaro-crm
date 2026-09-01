import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';

/**
 * Form templates for a project.
 *
 * This route used to read `.or(project_id.eq.{id}, is_global.eq.true)` on the
 * service-role client with no tenant filter, and projectId comes straight off
 * the URL. Any signed-in user could pass another tenant's project id and read
 * their templates; POST would write one INTO that project, and spread the
 * request body over the record so the client could set project_id — or
 * tenant_id — to whatever it liked.
 *
 * Three rules now, and they are the same three everywhere else in the app:
 *   1. The project must belong to the caller's tenant. Checked first, always.
 *   2. Every query filters on tenant_id. The service-role key bypasses RLS, so
 *      this filter IS the isolation — there is nothing behind it.
 *   3. tenant_id and project_id come from the server, never from the body.
 */

/** Confirm the project in the URL is one this tenant owns. */
async function ownsProject(db: ReturnType<typeof createServerClient>, projectId: string, tenantId: string) {
  const { data } = await db
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    if (!(await ownsProject(db, params.projectId, user.tenantId))) {
      return apiFail('Project not found', 404);
    }

    /* Global templates are the product's own starter forms, so they are shared
       across tenants by design — but a tenant's OWN templates never are. */
    const { data, error } = await db
      .from('form_templates')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .or(`project_id.eq.${params.projectId},is_global.eq.true`)
      .order('name');

    if (error) throw error;
    return NextResponse.json({ templates: data || [] });
  } catch (e) {
    // A failed read must not render as an empty result — return a real status
    // so the UI can show an error state with a retry.
    return apiError('projects/forms/templates', e, 'Could not load the form templates.');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;

  try {
    const body = await req.json().catch(() => ({}));
    const db = createServerClient();

    if (!(await ownsProject(db, params.projectId, g.user.tenantId))) {
      return apiFail('Project not found', 404);
    }

    if (!String(body.name || '').trim()) return apiFail('name is required', 400);

    /* The body is spread FIRST so the server's own fields cannot be overridden
       by it. The old order let the client set project_id and tenant_id. */
    const record = {
      ...body,
      tenant_id: g.user.tenantId,
      project_id: params.projectId,
      created_by: g.user.email,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await db.from('form_templates').insert(record).select().single();

    /* A failed insert used to return a made-up id and a 200, so the GC saw
       "saved" and had nothing. Report the failure. */
    if (error) throw error;

    return NextResponse.json({ template: data });
  } catch (e) {
    return apiError('projects/forms/templates', e, 'Could not save the form template.');
  }
}
