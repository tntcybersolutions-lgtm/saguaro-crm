/**
 * Server side of the item pages: find one tool item the signed-in user may
 * see, inside their own company, with the tool's permission applied to the
 * item's own job.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission, getEffectivePermissions } from '@/lib/permissions';
import { meetsLevel, type PermLevel } from '@/lib/permission-categories';
import { itemTool, ITEM_TOOLS, type ItemTool } from './registry';

type Db = ReturnType<typeof createServerClient>;
export type LoadedItem =
  | { ok: true; tool: ItemTool; item: Record<string, unknown>; user: { id: string; tenantId: string; email: string }; db: Db }
  | { ok: false; res: NextResponse };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadItem(req: NextRequest, type: string, id: string, level: PermLevel): Promise<LoadedItem> {
  const tool = itemTool(type);
  if (!tool) return { ok: false, res: NextResponse.json({ error: 'Unknown item type' }, { status: 404 }) };
  if (!UUID.test(id)) return { ok: false, res: NextResponse.json({ error: 'Item not found' }, { status: 404 }) };
  const user = await getUser(req);
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = createServerClient();
  // `as never`: the table comes from the registry whitelist, not the request.
  let q = db.from(tool.table as never).select('*').eq('id', id).eq('tenant_id', user.tenantId);
  if (tool.hasDeletedAt) q = q.is('deleted_at', null);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error(`[items/${type}] read failed`, error);
    return { ok: false, res: NextResponse.json({ error: "Couldn't load this item." }, { status: 500 }) };
  }
  if (!data) return { ok: false, res: NextResponse.json({ error: `${tool.noun} not found` }, { status: 404 }) };
  const item = data as Record<string, unknown>;
  const g = await requirePermission(req, tool.perm, level, { projectId: (item.project_id as string) || null, db });
  if (!g.ok) return { ok: false, res: g.res };
  return { ok: true, tool, item, user, db };
}

/**
 * The tools this person may see on a job — so search and Related never show a
 * subcontract or PO to someone without Budget access, or an RFI without RFIs.
 */
export async function viewableTools(db: Db, user: { id: string; tenantId: string }, projectId: string | null): Promise<Set<string>> {
  const perms = await getEffectivePermissions(db, user.id, user.tenantId, projectId);
  return new Set(Object.values(ITEM_TOOLS).filter((t) => meetsLevel(perms[t.perm], 'View')).map((t) => t.type));
}
