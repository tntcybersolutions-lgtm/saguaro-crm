import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/* Create a takeoff.
 *
 * getUser() used to be called near the end, described as optional "so
 * service-context callers still succeed" — but nothing else authenticated the
 * route, so in practice anyone could create a takeoff against any project id.
 * The session is now established up front and the project lookup and the insert
 * are both scoped to the caller's tenant.
 */

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const supabase = createServerClient();
    const { projectId } = await req.json();
    if (!projectId) return badRequest('projectId required');

    // Validate the project exists and belongs to the caller
    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('tenant_id', user.tenantId)
      .eq('id', projectId)
      .maybeSingle();

    if (!project) return badRequest('Project not found');

    const { data, error } = await supabase
      .from('takeoffs')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        status: 'pending',
        name: `Takeoff ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return ok({ ...data, project_name: project.name });
  } catch (err) {
    return serverError(err);
  }
}
