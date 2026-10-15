/**
 * GET /api/drawings/:id/sheet — one sheet for the viewer: the drawing (signed
 * file link), every revision of the same sheet number on the job, and the
 * pins on it with the name, status and page link of the item each points at.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signFields } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';
import { sheetKey, toolForPin } from '@/lib/drawing-revisions';
import { itemTool, itemName, statusLabel } from '@/lib/items/registry';
import { viewableTools } from '@/lib/items/server';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
  const db = createServerClient();
  const g = await requirePermission(req, 'Documents', 'View', { db });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const { data: d } = await db.from('drawings').select('*').eq('id', id).eq('tenant_id', user.tenantId).is('deleted_at', null).maybeSingle();
    if (!d) return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
    const drawing = d as Row;
    const projectId = drawing.project_id as string;
    const pg = await requirePermission(req, 'Documents', 'View', { projectId, db });
    if (!pg.ok) return pg.res;

    const [{ data: siblings }, { data: pinRows }, { data: project }] = await Promise.all([
      db.from('drawings').select('id, name, sheet_number, version, status, revision_date, url, created_at').eq('tenant_id', user.tenantId).eq('project_id', projectId).is('deleted_at', null),
      db.from('drawing_pins').select('*').eq('tenant_id', user.tenantId).eq('drawing_id', id).order('created_at', { ascending: true }),
      db.from('projects').select('id, name').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle(),
    ]);
    const revisions = ((siblings || []) as Row[])
      .filter((s) => sheetKey(s.sheet_number) === sheetKey(drawing.sheet_number))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((s) => ({ id: s.id, version: s.version, status: s.status, revision_date: s.revision_date, created_at: s.created_at, name: s.name }));

    // Names for linked items, one read per tool, only tools this person may see.
    const allowed = await viewableTools(db, user, projectId);
    const pins = (pinRows || []) as Row[];
    const byTool = new Map<string, string[]>();
    for (const p of pins) {
      const t = toolForPin(p.entity_type as string | null);
      if (t && p.entity_id && itemTool(t) && allowed.has(t)) byTool.set(t, [...(byTool.get(t) || []), String(p.entity_id)]);
    }
    const found = new Map<string, Row>();
    await Promise.all(Array.from(byTool.entries()).map(async ([t, ids]) => {
      const tool = itemTool(t)!;
      const { data } = await db.from(tool.table as never).select('*').eq('tenant_id', user.tenantId).in('id', ids);
      ((data || []) as Row[]).forEach((r) => found.set(`${t}:${r.id}`, r));
    }));
    const pinsOut = pins.flatMap((p) => {
      const t = toolForPin(p.entity_type as string | null);
      const tool = t ? itemTool(t) : null;
      const linked = tool ? found.get(`${t}:${p.entity_id}`) : undefined;
      if (tool && p.entity_id && !linked) {
        // Linked item gone, deleted, or not visible to this person: show it as a plain note only if it has words of its own.
        if (!p.title && !p.description) return [];
      }
      return [{
        id: p.id, x: Number(p.x_pct ?? p.x) || 0, y: Number(p.y_pct ?? p.y) || 0, page: Number(p.page_number) || 1,
        title: (p.title as string) || null, description: (p.description as string) || null, color: p.color, status: p.status,
        item: linked && tool && !(tool.hasDeletedAt && linked.deleted_at) ? {
          type: tool.type, id: linked.id, noun: tool.noun, name: itemName(tool, linked), status: statusLabel(linked[tool.statusKey] as string),
          href: `/app/projects/${projectId}/items/${tool.type}/${linked.id}`,
        } : null,
        created_at: p.created_at,
      }];
    });

    const [signed] = await signFields([{ ...drawing, file_url: drawing.url } as Row], ['url', 'file_url']);
    const url = String(signed.url || '');
    return NextResponse.json({
      drawing: { id: drawing.id, name: drawing.name, sheet_number: drawing.sheet_number, discipline: drawing.discipline, version: drawing.version, status: drawing.status, revision_date: drawing.revision_date, url, isPdf: /\.pdf(\?|$)/i.test(String(drawing.url || '')) },
      project,
      revisions,
      pins: pinsOut,
    });
  } catch (e) {
    return apiError('drawings/id/sheet', e, "Couldn't open this sheet.");
  }
}
