import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { signFields } from '@/lib/storage-signing';
import { ok, notFound, serverError, unauthorized } from '@/lib/api-response';
import { takeoffState } from '@/lib/takeoff-status';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req).catch(() => null);
    if (!user) return unauthorized();
    const supabase = createServerClient();
    const { id } = await params;

    // Query takeoff without FK join to avoid PGRST200 errors.
    // tenant_id filter prevents cross-tenant IDOR (service-role bypasses RLS).
    const { data: takeoff, error: takeoffErr } = await supabase
      .from('takeoffs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (takeoffErr || !takeoff) {
      return notFound('Takeoff not found');
    }

/* Blueprints are a private bucket. The row still stores the object's public-form
   URL — signStoredUrl parses the path back out of it — so nothing had to be
   migrated in the database; the link is minted per request and expires. */
    const [signedTakeoff] = await signFields([takeoff as Record<string, unknown>], ['file_url', 'thumbnail_url'], 3600, { strict: false });

    // Look up project name separately
    let projectName: string | null = null;
    if (takeoff.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', takeoff.project_id)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      projectName = project?.name || null;
    }

    const { data: materials, error: materialsErr } = await supabase
      .from('takeoff_materials')
      .select('*')
      .eq('takeoff_id', id)
      .order('sort_order', { ascending: true });

    if (materialsErr) throw materialsErr;

    let materialRows: Array<Record<string, unknown>> = materials || [];
    if (materialRows.length === 0) {
      // Fallback: measured/deterministic takeoffs write takeoff_line_items (not
      // takeoff_materials). Map them to the same shape (same mapping as sage-auto-docs)
      // so the detail API shows real lines from BOTH write paths instead of blanking.
      const { data: liData } = await supabase
        .from('takeoff_line_items')
        .select('*')
        .eq('takeoff_id', id)
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

    const result = {
      ...signedTakeoff,
      // Complete only with something measured in it (lib/takeoff-status).
      status: takeoffState((signedTakeoff as Record<string, unknown>).status, materialRows.length),
      stored_status: (signedTakeoff as Record<string, unknown>).status,
      item_count: materialRows.length,
      project_name: projectName,
      materials: materialRows,
    };

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}
