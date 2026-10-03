/**
 * GET  /api/home?view=&scope=mine|team&project=<uuid>&window=today|7d
 *      The role-based home: context, metrics, ranked action queue, schedule,
 *      work table, per-section errors. docs/SPEC-dashboard-2026-10-03.md.
 * POST /api/home  { view }  — remember the user's chosen home view.
 *
 * Views are filtered by the caller's effective permissions on the server.
 * Asking for a view you do not hold returns your default instead — switching
 * views never widens access.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { getEffectivePermissions, hasPermission, type PermissionMap } from '@/lib/permissions';
import { BUILDERS, type BuildCtx, type Scope, type Window } from '@/lib/home/build';
import { HOME_VIEWS, VIEW_LABEL, ymdIn, type HomeView } from '@/lib/home/rank';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function availableViews(perms: PermissionMap, baseRole: string): HomeView[] {
  const v: HomeView[] = [];
  if (hasPermission(perms, 'Projects', 'View')) v.push('operations');
  if (hasPermission(perms, 'Sales', 'View')) v.push('sales');
  if (hasPermission(perms, 'Projects', 'View')) v.push('service');
  if (baseRole === 'admin' || baseRole === 'owner' || hasPermission(perms, 'Admin', 'Full')) v.push('owner');
  if (hasPermission(perms, 'Projects', 'View')) v.push('field');
  return v;
}

function roleDefault(perms: PermissionMap, baseRole: string, roleNames: string[], available: HomeView[]): HomeView {
  const pick = (v: HomeView) => (available.includes(v) ? v : null);
  if (baseRole === 'admin' || baseRole === 'owner') return pick('owner') || pick('operations') || available[0] || 'operations';
  // Same rule the login landing uses: Sales without Budget/Admin is a salesperson.
  const held = (c: keyof PermissionMap) => (perms[c] ?? 'None') !== 'None';
  if (held('Sales') && !held('Budget') && !held('Admin')) return pick('sales') || available[0] || 'operations';
  if (roleNames.some(n => /superintendent|foreman|field/i.test(n))) return pick('field') || available[0] || 'operations';
  return pick('operations') || available[0] || 'operations';
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const sp = req.nextUrl.searchParams;

    const [perms, profileRes, prefRes, rolesRes, tenantRes] = await Promise.all([
      getEffectivePermissions(db, user.id, user.tenantId),
      db.from('profiles').select('full_name, role, timezone').eq('id', user.id).eq('tenant_id', user.tenantId).maybeSingle(),
      db.from('user_preferences').select('custom_settings, timezone').eq('user_id', user.id).eq('tenant_id', user.tenantId).maybeSingle(),
      db.from('user_role_assignments').select('role_definitions(name)').eq('user_id', user.id).eq('tenant_id', user.tenantId),
      db.from('tenants').select('settings').eq('id', user.tenantId).maybeSingle(),
    ]);
    if (profileRes.error) throw profileRes.error;

    const profile = (profileRes.data || {}) as { full_name?: string | null; role?: string | null; timezone?: string | null };
    const baseRole = String(profile.role || '').toLowerCase();
    const custom = ((prefRes.data as { custom_settings?: Record<string, unknown> } | null)?.custom_settings || {}) as Record<string, unknown>;
    const roleNames = ((rolesRes.data || []) as Array<{ role_definitions: { name?: string } | { name?: string }[] | null }>)
      .flatMap(r => (Array.isArray(r.role_definitions) ? r.role_definitions : [r.role_definitions]))
      .map(r => r?.name || '')
      .filter(Boolean);
    const timeZone = String((prefRes.data as { timezone?: string } | null)?.timezone || profile.timezone || 'America/Phoenix');
    const features = (((tenantRes.data as { settings?: { features?: Record<string, unknown> } } | null)?.settings?.features) || {}) as Record<string, unknown>;

    const available = availableViews(perms, baseRole);
    if (!available.length) {
      return NextResponse.json({ error: 'Your role has no home views yet. Ask an admin for Projects or Sales access.' }, { status: 403 });
    }
    const saved = typeof custom.home_view === 'string' && available.includes(custom.home_view as HomeView) ? (custom.home_view as HomeView) : null;
    const defaultView = saved || roleDefault(perms, baseRole, roleNames, available);
    const requested = sp.get('view') as HomeView | null;
    const view: HomeView = requested && available.includes(requested) ? requested : defaultView;

    const scope: Scope = sp.get('scope') === 'mine' ? 'mine' : sp.get('scope') === 'team' ? 'team' : view === 'field' ? 'mine' : 'team';
    const window: Window = sp.get('window') === 'today' ? 'today' : '7d';

    let projectId: string | null = null;
    const rawProject = sp.get('project');
    if (rawProject) {
      if (!UUID_RE.test(rawProject)) return NextResponse.json({ error: 'project must be a job id' }, { status: 400 });
      const { data: p, error } = await db.from('projects').select('id, name').eq('id', rawProject).eq('tenant_id', user.tenantId).maybeSingle();
      if (error) throw error;
      if (!p) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      projectId = p.id;
    }

    const ctx: BuildCtx = {
      db, tenantId: user.tenantId,
      me: { id: user.id, email: user.email, name: profile.full_name || null },
      perms, scope, projectId, today: ymdIn(timeZone), window,
    };
    const errors: Record<string, string> = {};
    const sections = await BUILDERS[view](ctx, errors);

    return NextResponse.json({
      context: {
        view, viewLabel: VIEW_LABEL[view], defaultView, savedView: saved,
        views: HOME_VIEWS.filter(v => available.includes(v)).map(v => ({ key: v, label: VIEW_LABEL[v] })),
        scope, window, projectId, today: ctx.today, timeZone,
        firstName: (profile.full_name || '').split(' ')[0] || null,
        classicHome: features.classic_home === true,
      },
      ...sections,
      generatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return apiError('home', e, 'Could not load your home dashboard.');
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const view = String(body.view || '') as HomeView;
    if (!HOME_VIEWS.includes(view)) return NextResponse.json({ error: 'view must be one of ' + HOME_VIEWS.join(', ') }, { status: 400 });

    const db = createServerClient();
    const [perms, profileRes] = await Promise.all([
      getEffectivePermissions(db, user.id, user.tenantId),
      db.from('profiles').select('role').eq('id', user.id).eq('tenant_id', user.tenantId).maybeSingle(),
    ]);
    const baseRole = String((profileRes.data as { role?: string } | null)?.role || '').toLowerCase();
    if (!availableViews(perms, baseRole).includes(view)) {
      return NextResponse.json({ error: 'Your role cannot use that view.' }, { status: 403 });
    }

    const { data: existing, error: readErr } = await db
      .from('user_preferences').select('id, custom_settings')
      .eq('user_id', user.id).eq('tenant_id', user.tenantId).maybeSingle();
    if (readErr) throw readErr;
    const custom = { ...(((existing as { custom_settings?: Record<string, unknown> } | null)?.custom_settings) || {}), home_view: view };

    if (existing) {
      const { error } = await db.from('user_preferences').update({ custom_settings: custom, updated_at: new Date().toISOString() }).eq('id', (existing as { id: string }).id).eq('tenant_id', user.tenantId);
      if (error) throw error;
    } else {
      const { error } = await db.from('user_preferences').insert({ user_id: user.id, tenant_id: user.tenantId, custom_settings: custom });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, view });
  } catch (e) {
    return apiError('home/preference', e, 'Could not save your home view.');
  }
}
