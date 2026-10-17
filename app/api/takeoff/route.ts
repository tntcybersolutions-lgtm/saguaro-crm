import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { signFields } from '@/lib/storage-signing';
import { ok, serverError, unauthorized } from '@/lib/api-response';
import { withTakeoffState } from '@/lib/takeoff-status';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req).catch(() => null);
    if (!user) return unauthorized();
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Query takeoffs without FK join to avoid PGRST200 errors.
    // Scoped to the caller's tenant — service-role bypasses RLS, so the filter is mandatory.
    let query = supabase
      .from('takeoffs')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) throw error;

/* Blueprints are a private bucket. The row still stores the object's public-form
   URL — signStoredUrl parses the path back out of it — so nothing had to be
   migrated in the database; the link is minted per request and expires. */
    /* status is read from what is in the takeoff (lib/takeoff-status): one
       marked complete with nothing measured reads 'empty', never Complete.
       stored_status and item_count ride along. */
    const rows = await signFields(
      await withTakeoffState(supabase, user.tenantId, (data || []) as Record<string, unknown>[]),
      ['file_url', 'thumbnail_url'],
      3600,
      { strict: false },
    );
    // W-18: ?include=latestDetail rides the newest takeoff's line items along with the
    // list, so the hub paints list + detail from ONE round trip instead of a dependent
    // pair. Kicked off here (.then fires the lazy builder) so it runs concurrently with
    // the project-name lookup below.
    const latestId = searchParams.get('include') === 'latestDetail' && rows.length > 0
      ? ((rows[0] as Record<string, unknown>).id as string)
      : null;
    const latestMaterialsP = latestId
      ? supabase.from('takeoff_materials').select('*').eq('takeoff_id', latestId).order('sort_order', { ascending: true }).then((r) => r)
      : null;
    const projectIds = [...new Set(rows.map((t: Record<string, unknown>) => t.project_id).filter(Boolean))] as string[];
    let projectMap: Record<string, string> = {};

    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .eq('tenant_id', user.tenantId)
        .in('id', projectIds);
      if (projects) {
        projectMap = Object.fromEntries(projects.map((p: { id: string; name: string }) => [p.id, p.name]));
      }
    }

    const takeoffs = rows.map((t: Record<string, unknown>) => ({
      ...t,
      project_name: (t.project_id && projectMap[t.project_id as string]) || null,
    }));

    // Attach the newest takeoff's materials (detail shape) when requested — non-fatal on error,
    // the hub falls back to its dependent detail fetch if the key is absent.
    if (latestMaterialsP && takeoffs.length > 0) {
      const { data: latestMaterials, error: latestErr } = await latestMaterialsP;
      if (!latestErr) (takeoffs[0] as Record<string, unknown>).materials = latestMaterials || [];
    }

    return ok(takeoffs);
  } catch (err) {
    return serverError(err);
  }
}
