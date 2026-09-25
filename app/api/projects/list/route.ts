import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ projects: [], source: 'unauth' }, { status: 401 });
    }
    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .select('*')
      .eq('tenant_id', user.tenantId)
      // Exclude soft-deleted / archived projects. Legacy rows have NULL flags,
      // so keep NULL (treated as not-archived) and drop only explicit `true`.
      .or('is_archived.is.null,is_archived.eq.false')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const projects = data || [];

    /* LIVE OPEN-ITEM COUNTS.
     *
     * The Portfolio Command Center reads p.open_rfis ?? p.rfi_count,
     * p.open_punch ?? p.punch_count and p.open_cos ?? p.co_count. Nothing
     * ever supplied the first of each pair, and the fallbacks are
     * denormalised columns nothing in this codebase writes (co_count is not
     * even a real column). So every project on that screen showed 0 open
     * RFIs, 0 punch and 0 change orders, permanently, whatever was actually
     * open. Same disease as projects.open_punch_count on the closeout page.
     *
     * Three queries TOTAL, not three per project: each pulls just
     * (project_id, status) for the tenant and is tallied here. Status
     * vocabularies match lib/project-lifecycle.ts. A query that fails leaves
     * its counts absent rather than reporting a confident zero. */
    const tally = (
      rows: { project_id: string | null; status: string | null }[] | null,
      isOpen: (s: string) => boolean,
    ) => {
      const m = new Map<string, number>();
      for (const r of rows || []) {
        if (!r.project_id) continue;
        if (!isOpen(String(r.status || '').toLowerCase())) continue;
        m.set(r.project_id, (m.get(r.project_id) || 0) + 1);
      }
      return m;
    };

    // Written out rather than looped: the generated Supabase types key
    // .from() on a literal table-name union, so a `(table: string)` helper
    // blows the type checker's instantiation depth.
    const [rfiRes, punchRes, coRes] = await Promise.all([
      db.from('rfis').select('project_id, status').eq('tenant_id', user.tenantId),
      db.from('punch_list').select('project_id, status').eq('tenant_id', user.tenantId),
      db.from('change_orders').select('project_id, status').eq('tenant_id', user.tenantId),
    ]);

    const rfiOpen = rfiRes.error ? null : tally(rfiRes.data as never, (s) => s !== 'answered' && s !== 'closed');
    const punchOpen = punchRes.error ? null : tally(punchRes.data as never, (s) => s !== 'completed' && s !== 'voided');
    const coOpen = coRes.error ? null : tally(coRes.data as never, (s) => s === 'pending');

    const withCounts = projects.map((p: Record<string, unknown>) => ({
      ...p,
      ...(rfiOpen ? { open_rfis: rfiOpen.get(String(p.id)) || 0 } : {}),
      ...(punchOpen ? { open_punch: punchOpen.get(String(p.id)) || 0 } : {}),
      ...(coOpen ? { open_cos: coOpen.get(String(p.id)) || 0 } : {}),
    }));

    return NextResponse.json({ projects: withCounts, source: 'live' });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/list] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/list', e, 'Failed to load projects');
  }
}
