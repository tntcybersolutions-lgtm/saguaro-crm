import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
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

    const { data, error } = await supabase
      .from('takeoffs')
      .insert({
        project_id: projectId,
        status: 'pending',
        name: `Takeoff ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      })
      .select()
      .single();

    if (error) throw error;
    return ok({ ...data, project_name: project.name });
  } catch (err) {
    return serverError(err);
  }
}
