import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { ok, badRequest, serverError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return badRequest('projectId required');

    const { data, error } = await supabase
      .from('takeoffs')
      .select('*, takeoff_materials(*)')
      .eq('project_id', projectId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return ok(data || null);
  } catch (err) {
    return serverError(err);
  }
}
