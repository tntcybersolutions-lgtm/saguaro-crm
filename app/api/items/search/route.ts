/**
 * GET /api/items/search?projectId=…&q=…&exclude=type:id
 * Finds RFIs, submittals and punch items on one job by number or words — the
 * picker behind "Link an item".
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { ITEM_TOOLS, itemName, statusLabel } from '@/lib/items/registry';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  const g = await requirePermission(req, 'Projects', 'View', { projectId });
  if (!g.ok) return g.res;
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 80);
  const exclude = req.nextUrl.searchParams.get('exclude') || '';
  try {
    const safe = q.replace(/[%,()*]/g, ' ').trim();
    const results = await Promise.all(Object.values(ITEM_TOOLS).map(async (tool) => {
      let query = g.db.from(tool.table as never).select('*').eq('tenant_id', g.user.tenantId).eq('project_id', projectId);
      if (tool.hasDeletedAt) query = query.is('deleted_at', null);
      if (safe) query = query.or(tool.searchKeys.map((k) => `${k}.ilike.%${safe}%`).join(','));
      const { data, error } = await query.order('created_at', { ascending: false }).limit(15);
      if (error) { console.error('[items/search]', tool.table, error); return []; }
      return ((data || []) as Record<string, unknown>[])
        .filter((r) => `${tool.table}:${r.id}` !== exclude)
        .map((r) => ({ type: tool.type, id: r.id, noun: tool.noun, name: itemName(tool, r), status: statusLabel(r[tool.statusKey] as string) }));
    }));
    return NextResponse.json({ items: results.flat().slice(0, 40) });
  } catch (e) {
    return apiError('items/search', e, "Couldn't search items.");
  }
}
