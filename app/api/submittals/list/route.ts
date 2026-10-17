import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

/**
 * GET /api/submittals/list?projectId= → { submittals }
 *
 * Each row also carries `bic_since`: the moment its ball in court last moved,
 * from the change-history trigger (audit_logs). That read is non-fatal — when
 * it fails or a row has no recorded handoff, `bic_since` is null and the
 * screen falls back to the row's own phase date.
 */
export async function GET(req: NextRequest) {
  // Role check, not just sign-in: Submittals: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Submittals', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('submittals').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false }).limit(1000);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []) as Record<string, any>[];

    const since = new Map<string, string>();
    if (projectId && rows.length) {
      const { data: hist, error: hErr } = await db
        .from('audit_logs')
        .select('entity_id, created_at')
        .eq('tenant_id', user.tenantId)
        .eq('project_id', projectId)
        .eq('entity_type', 'submittals')
        .not('changes->ball_in_court', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (hErr) console.error('[submittals/list] ball-in-court history read failed', hErr);
      for (const h of (hist || []) as { entity_id: string | null; created_at: string }[]) {
        if (h.entity_id && !since.has(String(h.entity_id))) since.set(String(h.entity_id), h.created_at);
      }
    }
    return NextResponse.json({ submittals: rows.map((r) => ({ ...r, bic_since: since.get(String(r.id)) || null })) });
  } catch (e) {
    return apiError('submittals/list', e, "Couldn't load the submittal log. Please try again.");
  }
}
