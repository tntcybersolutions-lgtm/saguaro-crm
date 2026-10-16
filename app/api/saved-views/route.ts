/**
 * Saved list views — the columns, order, widths, filters, sort and grouping of
 * one list (DataTable in components/ui/kit.tsx), saved under a name.
 *
 *   GET    ?module=…[&project_id=…]  → the caller's own views + every view a
 *                                       teammate shared with the company
 *   POST   { name, module, … }       → save a new view
 *   PATCH  ?id=…  { … }              → update one of the caller's own views
 *   DELETE ?id=…                     → remove one of the caller's own views
 *
 * A view belongs to the person who saved it. `is_shared` lets everyone in the
 * same company load it; only its owner can change or remove it. Sharing with
 * the company needs Edit on Projects — the same bar as changing project
 * records — so a read-only seat cannot push views onto the whole team.
 * `is_default` is the owner's own default for that list.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { getEffectivePermissions, hasPermission } from '@/lib/permissions';
import type { Json } from '@/lib/database.types';

type ViewRow = {
  id: string; user_id: string; name: string; module: string; project_id: string | null;
  columns: string[] | null; column_widths: Json; filters: Json | null; sort_by: string | null;
  sort_direction: string | null; is_default: boolean | null; is_shared: boolean;
  created_at: string | null; updated_at: string | null;
};

const COLS = 'id, user_id, name, module, project_id, columns, column_widths, filters, sort_by, sort_direction, is_default, is_shared, created_at, updated_at';

/** What the browser gets: no owner id, just whether the caller owns it. */
function shape(v: ViewRow, me: string) {
  const { user_id, ...rest } = v;
  return { ...rest, mine: user_id === me };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asStringArray = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 80) : null;
const asObject = (v: unknown): Json | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined;

async function mayShare(db: ReturnType<typeof createServerClient>, userId: string, tenantId: string): Promise<boolean> {
  const perms = await getEffectivePermissions(db, userId, tenantId, null);
  return hasPermission(perms, 'Projects', 'Edit');
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const sp = req.nextUrl.searchParams;
    const module = sp.get('module');
    const projectId = sp.get('project_id');
    if (!module) return NextResponse.json({ error: 'module is required' }, { status: 400 });
    // Goes into a PostgREST or() filter below — only a bare uuid may reach it.
    if (projectId && !UUID_RE.test(projectId)) return NextResponse.json({ error: 'project_id must be a job id' }, { status: 400 });

    const db = createServerClient();
    const { data, error } = await db
      .from('saved_views')
      .select(COLS)
      .eq('tenant_id', user.tenantId)
      .eq('module', module)
      .or(`user_id.eq.${user.id},is_shared.eq.true`)
      .order('name', { ascending: true });
    if (error) throw error;
    // A view saved without a job follows the tool onto every job; one saved on a job stays there.
    const views = ((data ?? []) as ViewRow[])
      .filter((v) => v.project_id == null || (projectId != null && v.project_id === projectId))
      .map((v) => shape(v, user.id));
    return NextResponse.json({ views, canShare: await mayShare(db, user.id, user.tenantId) });
  } catch (err) {
    return apiError('saved-views', err, "Couldn't load saved views.");
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const module = typeof body.module === 'string' ? body.module.slice(0, 200) : '';
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!module) return NextResponse.json({ error: 'module is required' }, { status: 400 });

    const db = createServerClient();
    const isShared = body.is_shared === true;
    if (isShared && !(await mayShare(db, user.id, user.tenantId))) {
      return NextResponse.json({ error: 'Sharing a view with the company needs Edit access to Projects. Ask an admin.' }, { status: 403 });
    }
    const isDefault = body.is_default === true;
    const projectId = typeof body.project_id === 'string' && UUID_RE.test(body.project_id) ? body.project_id : null;

    if (isDefault) {
      const { error: unsetErr } = await db.from('saved_views').update({ is_default: false })
        .eq('tenant_id', user.tenantId).eq('user_id', user.id).eq('module', module).eq('is_default', true);
      if (unsetErr) throw unsetErr;
    }

    const { data, error } = await db
      .from('saved_views')
      .insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        name,
        module,
        project_id: projectId,
        columns: asStringArray(body.columns),
        column_widths: asObject(body.column_widths) ?? {},
        filters: asObject(body.filters) ?? {},
        sort_by: typeof body.sort_by === 'string' ? body.sort_by : null,
        sort_direction: body.sort_direction === 'desc' ? 'desc' : 'asc',
        is_default: isDefault,
        is_shared: isShared,
      })
      .select(COLS)
      .single();
    if (error) throw error;
    return NextResponse.json({ view: shape(data as ViewRow, user.id) }, { status: 201 });
  } catch (err) {
    return apiError('saved-views', err, "Couldn't save the view.");
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = createServerClient();

    const { data: existing, error: readErr } = await db
      .from('saved_views').select('id, user_id, module')
      .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (readErr) throw readErr;
    if (!existing) return NextResponse.json({ error: 'View not found' }, { status: 404 });
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Only the person who saved this view can change it. Save a copy instead.' }, { status: 403 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
    if ('columns' in body) patch.columns = asStringArray(body.columns);
    if ('column_widths' in body) patch.column_widths = asObject(body.column_widths) ?? {};
    if ('filters' in body) patch.filters = asObject(body.filters) ?? {};
    if ('sort_by' in body) patch.sort_by = typeof body.sort_by === 'string' ? body.sort_by : null;
    if ('sort_direction' in body) patch.sort_direction = body.sort_direction === 'desc' ? 'desc' : 'asc';
    if (typeof body.is_shared === 'boolean') {
      if (body.is_shared && !(await mayShare(db, user.id, user.tenantId))) {
        return NextResponse.json({ error: 'Sharing a view with the company needs Edit access to Projects. Ask an admin.' }, { status: 403 });
      }
      patch.is_shared = body.is_shared;
    }
    if (typeof body.is_default === 'boolean') {
      if (body.is_default) {
        const { error: unsetErr } = await db.from('saved_views').update({ is_default: false })
          .eq('tenant_id', user.tenantId).eq('user_id', user.id).eq('module', existing.module).eq('is_default', true);
        if (unsetErr) throw unsetErr;
      }
      patch.is_default = body.is_default;
    }

    const { data, error } = await db
      .from('saved_views').update(patch)
      .eq('id', id).eq('tenant_id', user.tenantId).eq('user_id', user.id)
      .select(COLS).single();
    if (error) throw error;
    return NextResponse.json({ view: shape(data as ViewRow, user.id) });
  } catch (err) {
    return apiError('saved-views', err, "Couldn't update the view.");
  }
}

/** DELETE /api/saved-views?id=… — removes one of the signed-in user's own views. */
export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('saved_views')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .eq('user_id', user.id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) return NextResponse.json({ error: 'View not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError('saved-views', err, "Couldn't remove the view.");
  }
}
