/**
 * GET /api/layout-prefs?scope=home:owner     → { order, hidden }
 * PUT /api/layout-prefs { scope, order, hidden } → saves it
 *
 * How one person arranged a page's panels (Home per view, the job Overview).
 * Kept in user_preferences.custom_settings.layouts[scope], beside the other
 * per-person settings, so it follows them to every device.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { cleanLayout, LAYOUT_SCOPE } from '@/lib/panel-layout';

export const dynamic = 'force-dynamic';

type Custom = Record<string, unknown> & { layouts?: Record<string, unknown> };

async function readPrefs(db: ReturnType<typeof createServerClient>, user: { id: string; tenantId: string }) {
  const { data, error } = await db.from('user_preferences').select('id, custom_settings').eq('user_id', user.id).eq('tenant_id', user.tenantId).maybeSingle();
  if (error) throw error;
  return data as { id: string; custom_settings: Custom | null } | null;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = req.nextUrl.searchParams.get('scope') || '';
  if (!LAYOUT_SCOPE.test(scope)) return NextResponse.json({ error: 'scope is required' }, { status: 400 });
  try {
    const row = await readPrefs(createServerClient(), user);
    const saved = row?.custom_settings?.layouts?.[scope];
    return NextResponse.json(cleanLayout(saved) ?? { order: [], hidden: [] });
  } catch (e) {
    return apiError('layout-prefs', e, "Couldn't load your layout.");
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { scope?: string; order?: unknown; hidden?: unknown; reset?: boolean };
  const scope = String(body.scope || '');
  if (!LAYOUT_SCOPE.test(scope)) return NextResponse.json({ error: 'scope is required' }, { status: 400 });
  const layout = body.reset ? null : cleanLayout({ order: body.order, hidden: body.hidden });
  if (!body.reset && !layout) return NextResponse.json({ error: 'order and hidden must be lists of panel names' }, { status: 400 });
  try {
    const db = createServerClient();
    const row = await readPrefs(db, user);
    const custom: Custom = { ...(row?.custom_settings || {}) };
    const layouts = { ...((custom.layouts as Record<string, unknown>) || {}) };
    if (layout) layouts[scope] = layout; else delete layouts[scope];
    custom.layouts = layouts;
    const now = new Date().toISOString();
    if (row) {
      const { error } = await db.from('user_preferences').update({ custom_settings: custom, updated_at: now } as never).eq('id', row.id).eq('tenant_id', user.tenantId);
      if (error) throw error;
    } else {
      const { error } = await db.from('user_preferences').insert({ user_id: user.id, tenant_id: user.tenantId, custom_settings: custom } as never);
      if (error) throw error;
    }
    return NextResponse.json(layout ?? { order: [], hidden: [] });
  } catch (e) {
    return apiError('layout-prefs', e, "Couldn't save your layout.");
  }
}
