import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { ok, badRequest, serverError } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { projectId } = await req.json();
    if (!projectId) return badRequest('projectId required');

    const { data, error } = await supabase
      .from('takeoffs')
      .insert({
        project_id: projectId,
        status: 'pending',
        name: `Takeoff ${new Date().toLocaleDateString()}`,
      })
      .select()
      .single();

    if (error) throw error;
    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}
