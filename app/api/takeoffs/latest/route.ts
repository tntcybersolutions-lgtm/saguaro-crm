import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { ok, badRequest, serverError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return badRequest('projectId required');

    // Query takeoff first, then materials separately to avoid FK resolution issues
    const { data: takeoff, error } = await supabase
      .from('takeoffs')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!takeoff) return ok(null);

    // Fetch materials separately
    const { data: materials } = await supabase
      .from('takeoff_materials')
      .select('*')
      .eq('takeoff_id', takeoff.id)
      .order('sort_order', { ascending: true });

    return ok({ ...takeoff, takeoff_materials: materials || [] });
  } catch (err) {
    return serverError(err);
  }
}
