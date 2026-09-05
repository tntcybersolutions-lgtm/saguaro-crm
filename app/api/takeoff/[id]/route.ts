import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, notFound, unauthorized, serverError } from '@/lib/api-response';

/* Had no auth guard and no tenant filter on the service role client: any caller
 * with a takeoff id could read that takeoff, its project name and its full
 * material pricing. */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  try {
    const supabase = createServerClient();
    const { id } = await params;

    // Query takeoff without FK join to avoid PGRST200 errors
    const { data: takeoff, error: takeoffErr } = await supabase
      .from('takeoffs')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .single();

    if (takeoffErr || !takeoff) {
      return notFound('Takeoff not found');
    }

    // Look up project name separately
    let projectName: string | null = null;
    if (takeoff.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('tenant_id', user.tenantId)
        .eq('id', takeoff.project_id)
        .maybeSingle();
      projectName = project?.name || null;
    }

    const { data: materials, error: materialsErr } = await supabase
      .from('takeoff_materials')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('takeoff_id', id)
      .order('sort_order', { ascending: true });

    if (materialsErr) throw materialsErr;

    const result = {
      ...takeoff,
      project_name: projectName,
      materials: materials || [],
    };

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
