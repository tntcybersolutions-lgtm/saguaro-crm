import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { jobHealth } from '@/lib/job-health';
import { jobStage, billedPct } from '@/lib/job-page';
import { isDoneStatus } from '@/lib/project-lifecycle';

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
    const since = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
    const [rfiRes, punchRes, coRes, payRes, subRes, budRes, logRes, incRes] = await Promise.all([
      db.from('rfis').select('project_id, status, due_date, response_due_date').eq('tenant_id', user.tenantId).is('deleted_at', null),
      db.from('punch_list').select('project_id, status, due_date').eq('tenant_id', user.tenantId).is('deleted_at', null),
      db.from('change_orders').select('project_id, status, created_at').eq('tenant_id', user.tenantId).is('deleted_at', null),
      /* BILLED, FROM THE PAY APPS. projects.billed_to_date / total_billed are
         denormalised and disagree with each other (a fully billed job reads 0
         in one and $2.54M in the other), so the Jobs list's "% billed" is read
         from the pay applications themselves: the latest app's completed and
         stored to date — the same figure /api/project-context reports. */
      db.from('pay_applications').select('project_id, app_number, total_completed_stored, status').eq('tenant_id', user.tenantId).is('deleted_at', null),
      /* Health ring inputs: submittal due dates and the budget forecast. */
      db.from('submittals').select('project_id, status, due_date').eq('tenant_id', user.tenantId).is('deleted_at', null),
      db.from('budget_lines').select('project_id, original_budget, approved_changes, projected, actual, committed').eq('tenant_id', user.tenantId),
      /* Daily log and safety dots: only the last month matters. */
      db.from('daily_logs').select('project_id, log_date').eq('tenant_id', user.tenantId).is('deleted_at', null).gte('log_date', since),
      db.from('safety_incidents').select('project_id, status, incident_date, created_at').eq('tenant_id', user.tenantId).is('deleted_at', null).gte('created_at', since),
    ]);
    if (logRes.error) console.error('[projects/list] daily log read failed:', logRes.error);
    if (incRes.error) console.error('[projects/list] incident read failed:', incRes.error);
    if (subRes.error) console.error('[projects/list] submittal read failed:', subRes.error);
    if (budRes.error) console.error('[projects/list] budget read failed:', budRes.error);
    const group = <T extends { project_id: string | null }>(rows: T[] | null | undefined) => {
      const m = new Map<string, T[]>();
      for (const r of rows || []) { if (!r.project_id) continue; const a = m.get(r.project_id) || []; a.push(r); m.set(r.project_id, a); }
      return m;
    };
    type DueRow = { project_id: string | null; status: string | null; due_date?: string | null; response_due_date?: string | null };
    const rfiBy = rfiRes.error ? null : group(rfiRes.data as DueRow[]);
    const subBy = subRes.error ? null : group(subRes.data as DueRow[]);
    const punchBy = punchRes.error ? null : group(punchRes.data as DueRow[]);
    const logBy = logRes.error ? null : group(logRes.data as { project_id: string | null; log_date: string | null }[]);
    const incBy = incRes.error ? null : group(incRes.data as { project_id: string | null; status: string | null; incident_date: string | null; created_at: string | null }[]);
    const coBy = coRes.error ? null : group(coRes.data as { project_id: string | null; status: string | null; created_at: string | null }[]);
    /* Budget per job: revised = original + approved changes; forecast = the
       larger of projected (when set), actual and committed — lib/budget-line. */
    const budgetBy = new Map<string, { revised: number; forecast: number }>();
    if (!budRes.error) {
      for (const l of (budRes.data || []) as Record<string, unknown>[]) {
        const pid = String(l.project_id || ''); if (!pid) continue;
        const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
        const revised = n(l.original_budget) + n(l.approved_changes);
        const proj = n(l.projected);
        const forecast = proj > 0 ? proj : Math.max(revised, n(l.actual), n(l.committed));
        const cur = budgetBy.get(pid) || { revised: 0, forecast: 0 };
        cur.revised += revised; cur.forecast += forecast;
        budgetBy.set(pid, cur);
      }
    }
    const todayYmd = new Date().toISOString().slice(0, 10);

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
      const id = String(p.id);
      const stageRaw = jobStage(p as { status?: unknown; phase?: unknown });
      const stage = stageRaw === 'closed' ? (isDoneStatus(p.status as string) ? 'complete' : 'closed') : stageRaw;
      const contract = Number(p.contract_amount ?? p.contract_value) || 0;
      const billedP = b && contract > 0 ? billedPct(b.billed, contract) : null;
      const ownPct = Number(p.percent_complete);
      const workPct = stage === 'complete' ? 100 : billedP != null ? billedP : Number.isFinite(ownPct) && ownPct > 0 ? ownPct : null;
      const bud = budgetBy.get(id);
      const health = jobHealth({
        stage,
        today: todayYmd,
        start: (p.actual_start_date || p.start_date || p.notice_to_proceed_date) as string | null,
        finish: (p.revised_completion_date || p.substantial_completion_date || p.end_date || p.target_finish_date) as string | null,
        workPct,
        budgetRevised: bud?.revised,
        budgetForecast: bud?.forecast,
        rfis: (rfiBy?.get(id) || []).map((r) => ({ status: r.status, due: r.response_due_date || r.due_date || null })),
        submittals: (subBy?.get(id) || []).map((r) => ({ status: r.status, due: r.due_date || null })),
        changeOrders: (coBy?.get(id) || []).map((c) => ({ status: c.status, created: c.created_at })),
        punch: (punchBy?.get(id) || []).map((r) => ({ status: r.status, due: r.due_date || null })),
        // A failed read passes undefined so the dot shows "not available", not a false "no log".
        logDates: logBy ? (logBy.get(id) || []).map((r) => r.log_date) : undefined,
        incidents: (incBy?.get(id) || []).map((r) => ({ status: r.status, date: r.incident_date || r.created_at })),
      });
      return {
        ...p,
        health,
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
