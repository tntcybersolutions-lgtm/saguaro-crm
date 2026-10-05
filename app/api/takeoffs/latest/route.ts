import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, serverError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // AUTH + TENANT: this dedicated route (which takes precedence over the
    // catch-all) was an unauthenticated service-role read of any project's
    // takeoff/estimate costs. Require a user and scope to their tenant.
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return badRequest('projectId required');

    // Query takeoff first, then materials separately to avoid FK resolution issues
    const { data: takeoff, error } = await supabase
      .from('takeoffs')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
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

    // Measured / deterministic takeoffs write takeoff_line_items instead of
    // takeoff_materials (same fallback as /api/takeoff/[id]), so the estimate
    // sees real lines from BOTH write paths instead of "No Takeoff Data Yet".
    let materialRows: Array<Record<string, unknown>> = materials || [];
    if (materialRows.length === 0) {
      const { data: liData } = await supabase
        .from('takeoff_line_items')
        .select('*')
        .eq('takeoff_id', takeoff.id)
        .order('sort_order', { ascending: true });
      materialRows = (liData || []).map((li) => {
        const um = Number(li.unit_material_cost) || 0, ul = Number(li.unit_labor_cost) || 0, qty = Number(li.quantity) || 0;
        return {
          csi_code: li.csi_code || '', csi_name: li.category || '',
          description: li.description || '', quantity: qty, unit: li.unit || 'EA',
          unit_cost: um + ul, total_cost: qty * (um + ul), labor_hours: 0,
          notes: li.notes || '', sort_order: Number(li.sort_order) || 0,
        };
      });
    }

    // `materials` is the name every reader uses (the detail route, the estimate
    // page); `takeoff_materials` stays for anything still reading the old key.
    return ok({ ...takeoff, materials: materialRows, takeoff_materials: materialRows });
  } catch (err) {
    return serverError(err);
  }
}
