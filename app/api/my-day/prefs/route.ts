/**
 * GET /api/my-day/prefs   → { prefs, saved }   the person's My Day layout (or null when never saved)
 * PUT /api/my-day/prefs   { prefs } | { reset: true }  → { prefs, saved }
 *
 * Stored in user_preferences.custom_settings.myDay beside the other
 * per-person settings, so a layout follows the person to every device.
 * The page applies role defaults when nothing is saved (lib/my-day-prefs).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { cleanPrefs, roleDefaults } from '@/lib/my-day-prefs';

export const dynamic = 'force-dynamic';

type Custom = Record<string, unknown> & { myDay?: unknown };

async function readRow(db: ReturnType<typeof createServerClient>, user: { id: string; tenantId: string }) {
  const { data, error } = await db.from('user_preferences').select('id, custom_settings')
    .eq('user_id', user.id).eq('tenant_id', user.tenantId).maybeSingle();
  if (error) throw error;
  return data as { id: string; custom_settings: Custom | null } | null;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const row = await readRow(createServerClient(), user);
    const raw = row?.custom_settings?.myDay;
    return NextResponse.json({ prefs: raw ? cleanPrefs(raw, roleDefaults([], false)) : null, saved: !!raw });
  } catch (e) {
    return apiError('my-day/prefs GET', e, "Couldn't load your My Day layout.");
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { prefs?: unknown; reset?: boolean } | null;
  if (!body || (!body.reset && (!body.prefs || typeof body.prefs !== 'object'))) {
    return NextResponse.json({ error: 'prefs: send the layout to save, or reset: true' }, { status: 400 });
  }
  try {
    const db = createServerClient();
    const row = await readRow(db, user);
    const custom: Custom = { ...(row?.custom_settings || {}) };
    const prefs = body.reset ? null : cleanPrefs(body.prefs, roleDefaults([], false));
    if (prefs) custom.myDay = prefs; else delete custom.myDay;
    const now = new Date().toISOString();
    if (row) {
      const { error } = await db.from('user_preferences').update({ custom_settings: custom, updated_at: now } as never)
        .eq('id', row.id).eq('tenant_id', user.tenantId);
      if (error) throw error;
    } else {
      const { error } = await db.from('user_preferences').insert({ user_id: user.id, tenant_id: user.tenantId, custom_settings: custom } as never);
      if (error) throw error;
    }
    return NextResponse.json({ prefs, saved: !!prefs });
  } catch (e) {
    return apiError('my-day/prefs PUT', e, "Couldn't save your My Day layout.");
  }
}
