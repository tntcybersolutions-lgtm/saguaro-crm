import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, serverError } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { projectId } = await req.json();
    if (!projectId) return badRequest('projectId required');

    // Validate project exists
    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .maybeSingle();

    if (!project) return badRequest('Project not found');

    // Record who created it when we have a session (audit trail). Optional so
    // service-context callers still succeed.
    const user = await getUser(req);

    const { data, error } = await supabase
      .from('takeoffs')
      .insert({
        project_id: projectId,
        status: 'pending',
        name: `Takeoff ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        ...(user ? { created_by: user.id } : {}),
      })
      .select()
      .single();

    if (error) throw error;
    return ok({ ...data, project_name: project.name });
  } catch (err) {
    return serverError(err);
  }
}
