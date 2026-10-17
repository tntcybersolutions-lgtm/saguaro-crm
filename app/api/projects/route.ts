import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { onlyLiveProjects } from '@/lib/live-projects';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects?limit=100&status=active&search=foo
 * List tenant-scoped projects. Used by the app shell (app/app/layout.tsx) and
 * several dashboard pages (daily-logs, invoicing, schedule, etc.) to populate
 * project pickers / Sage context.
 *
 * Response shape: { projects: [...] }  (callers read d.projects)
 * Optional query params:
 *   - limit:  max rows to return (default 100)
 *   - status: exact match on projects.status
 *   - search: case-insensitive match on name / project_number / address
 *   - fields: comma-separated column subset, e.g. `fields=id,name`
 *
 * `fields` was being ignored. Seven call sites already pass it —
 * app/app/layout, schedule, schedule/[id], invoicing, invoicing/[id],
 * daily-logs and reports — and every one of them was served all fifteen
 * columns anyway. The schedule page asks for id and name across two hundred
 * projects and gets two hundred rows of contract values, percentages,
 * addresses and timestamps to render a dropdown.
 *
 * Column names go into a PostgREST select string, so they are matched against
 * an allowlist and never interpolated from the query as given.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limitParamRaw = searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParamRaw || '100', 10) || 100, 1), 1000);
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();

    /* `phase` is here because the whole adaptive navigation is built on it —
       lib/project-phase drives the build rail, the sidebar's leading sections
       and the "you are here" bar off project.phase. The list endpoint never
       returned it, so nothing downstream of this list could tell a bidding job
       from a job under construction. */
    const COLUMNS = [
      'id', 'name', 'status', 'phase', 'address', 'city', 'state', 'project_number', 'color',
      'type', 'project_type', 'contract_value', 'percent_complete',
      'start_date', 'end_date', 'created_at', 'updated_at',
    ];
    const asked = (searchParams.get('fields') || '')
      .split(',').map((f) => f.trim()).filter(Boolean);
    const picked = asked.filter((f) => COLUMNS.includes(f));
    // An unknown or empty `fields` returns the full row rather than nothing —
    // a picker that asked for a column that does not exist should still render.
    const select = (picked.length ? Array.from(new Set(['id', ...picked])) : COLUMNS).join(', ');

    const db = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db
      .from('projects')
      .select(select)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Archived and deleted jobs stay out of every list (lib/live-projects).
    query = onlyLiveProjects(query);

    if (status) query = query.eq('status', status);
    if (search) {
      const term = search.replace(/[%,()]/g, ' ');
      query = query.or(
        `name.ilike.%${term}%,project_number.ilike.%${term}%,address.ilike.%${term}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ projects: data || [] });
  } catch (e) {
    /* Was `{ projects: [] }` with a 500 — an empty list is what this endpoint
       returns when a tenant genuinely has no projects, so a failure was shaped
       exactly like success and nothing was logged to say otherwise. Every
       caller already checks r.ok before parsing. */
    return apiError('projects', e);
  }
}
