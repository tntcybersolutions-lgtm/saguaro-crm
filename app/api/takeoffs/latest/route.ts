import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/* Latest completed takeoff for a project.
 *
 * Had no auth guard and no tenant filter on the service role client, so any
 * caller who knew or guessed a project id could read that project's takeoff
 * and its material pricing.
 */

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return badRequest('projectId required');

    // Query takeoff first, then materials separately to avoid FK resolution issues
    const { data: takeoff, error } = await supabase
      .from('takeoffs')
      .select('*')
      .eq('tenant_id', user.tenantId)
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
      .eq('tenant_id', user.tenantId)
      .eq('takeoff_id', takeoff.id)
      .order('sort_order', { ascending: true });

    return ok({ ...takeoff, takeoff_materials: materials || [] });
  } catch (err) {
    return serverError(err);
  }
}
