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
    const [rfiRes, punchRes, coRes, payRes] = await Promise.all([
      db.from('rfis').select('project_id, status').eq('tenant_id', user.tenantId),
      db.from('punch_list').select('project_id, status').eq('tenant_id', user.tenantId),
      db.from('change_orders').select('project_id, status').eq('tenant_id', user.tenantId),
      /* BILLED, FROM THE PAY APPS. projects.billed_to_date / total_billed are
         denormalised and disagree with each other (a fully billed job reads 0
         in one and $2.54M in the other), so the Jobs list's "% billed" is read
         from the pay applications themselves: the latest app's completed and
         stored to date — the same figure /api/project-context reports. */
      db.from('pay_applications').select('project_id, app_number, total_completed_stored, status').eq('tenant_id', user.tenantId).is('deleted_at', null),
    ]);

    const rfiOpen = rfiRes.error ? null : tally(rfiRes.data as never, (s) => s !== 'answered' && s !== 'closed');
    const punchOpen = punchRes.error ? null : tally(punchRes.data as never, (s) => s !== 'completed' && s !== 'voided');
    const coOpen = coRes.error ? null : tally(coRes.data as never, (s) => s === 'pending');
    if (payRes.error) console.error('[projects/list] pay application tally failed:', payRes.error);
    const billing = payRes.error ? null : (() => {
      const m = new Map<string, { app: number; billed: number; total: number; paid: number }>();
      for (const r of (payRes.data || []) as { project_id: string | null; app_number: unknown; total_completed_stored: unknown; status: string | null }[]) {
        if (!r.project_id) continue;
        const cur = m.get(r.project_id) || { app: -Infinity, billed: 0, total: 0, paid: 0 };
        const n = Number(r.app_number) || 0;
        if (n >= cur.app) { cur.app = n; cur.billed = Number(r.total_completed_stored) || 0; }
        cur.total++;
        if (String(r.status || '').toLowerCase() === 'paid') cur.paid++;
        m.set(r.project_id, cur);
      }
      return m;
    })();

    const withCounts = projects.map((p: Record<string, unknown>) => {
      const b = billing?.get(String(p.id));
      return {
        ...p,
        ...(rfiOpen ? { open_rfis: rfiOpen.get(String(p.id)) || 0 } : {}),
        ...(punchOpen ? { open_punch: punchOpen.get(String(p.id)) || 0 } : {}),
        ...(coOpen ? { open_cos: coOpen.get(String(p.id)) || 0 } : {}),
        /* Absent when the tally failed, so the list shows nothing rather than a confident 0%. */
        ...(billing ? { billed_live: b?.billed ?? 0, pay_apps_total: b?.total ?? 0, pay_apps_paid: b?.paid ?? 0 } : {}),
      };
    });

    return NextResponse.json({ projects: withCounts, source: 'live' });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/list] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/list', e, 'Failed to load projects');
  }
}
