import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';

/**
 * GET /api/intelligence/summary?projectIds=a,b,c
 *
 * The REAL cross-project intelligence brain — every figure computed live from
 * the tenant's own tables, never invented. Permission: Reports ≥ View.
 *
 * Selection: explicit ?projectIds (comma-separated, tenant-checked) or, by
 * default, all active projects (not deleted/archived, status not closed),
 * newest activity first — capped at 12 either way.
 *
 * Per project:
 *   money.contract      ← projects.contract_amount, falling back to
 *                         contract_value then contract_sum (Number()'d — NUMERIC
 *                         arrives as text). All money in this response is DOLLARS.
 *   money.billedToDate  ← the LATEST pay_applications row (highest app_number,
 *                         not deleted, not void/rejected): total_completed
 *                         (TEXT column — Number()'d) falling back to
 *                         total_completed_stored. G702 line 6 is cumulative,
 *                         so the latest app IS billed-to-date.
 *   money.invoicedCosts ← Σ invoices effectiveTotal for approved/paid/partial
 *                         invoices. effectiveTotal: a 0/absent `total` defers
 *                         to amount + tax.
 *   money.approvedCOs   ← Σ change_orders.amount where status = approved (+count).
 *   money.margin        ← contract − invoicedCosts ("gross-to-date": revenue
 *                         under contract minus costs invoiced so far — NOT
 *                         final margin).
 *
 * Schedule (all pct 0–100, 1-decimal):
 *   expectedBurnPct ← linear calendar position between start_date and end_date
 *                     as of today (local date-only math — never
 *                     new Date('YYYY-MM-DD')). null when either date is
 *                     missing or end ≤ start — we NEVER invent dates.
 *   actualBurnPct   ← invoicedCosts / contract. null when contract is 0/missing.
 *                     This is COST burn — what your subs and suppliers have
 *                     invoiced YOU — not what you have billed the owner.
 *   burnDelta       ← actualBurnPct − expectedBurnPct (null if either is null).
 *                     Positive = burning money faster than the calendar.
 *   billedPct       ← billedToDate / contract. What the OWNER has been billed.
 *                     Kept separate because the two answer opposite questions:
 *                     cost burn is about margin, billing burn is about cash.
 *
 * Field:
 *   openRfis / oldestRfiDays ← rfis in an open status (not deleted), aged by
 *                              created_at (full timestamps, so Date parse is safe).
 *   openPunch                ← punch_list rows NOT in a closed status. One
 *                              table: punch_list_items was merged into
 *                              punch_list (ids preserved) so both surfaces now
 *                              read and write the same rows.
 *   dailyLogStreak           ← consecutive calendar days with ≥1 daily_log,
 *                              walking back from today within the last 14 days;
 *                              today may be missing without breaking the streak
 *                              (the day isn't over yet).
 *   lastActivityAt           ← projects.last_activity_at, else the max of
 *                              last_log_at / last_rfi_at / last_pay_app_at /
 *                              last_photo_at, else null.
 *
 * healthScore (0–100) — ONE formula:
 *   score = Σ(weight_i × component_i) / Σ(weight_i)  over components that are
 *   computable; a component that can't be computed (missing dates/contract) is
 *   EXCLUDED and the remaining weights renormalized — never scored as 0 or 100.
 *   All components null → score null.
 *     schedule (weight .40) = 100 − min(100, |burnDelta| × 2)
 *     field    (weight .30) = ½·logScore + ½·rfiScore
 *                             logScore = min(100, dailyLogStreak × 20)   (5-day streak = 100)
 *                             rfiScore = 100 if no open RFIs,
 *                                        else max(0, 100 − oldestRfiDays × 5)  (20 days = 0)
 *     coPressure (weight .30) = 100 − min(100, (approvedCOs/contract) × 100 × 5)
 *                             (CO load of 20% of contract = 0)
 *   Components are returned so the UI can explain the number.
 *
 * Insights: honest sentences ONLY when a threshold trips (constants below),
 * max 6, sorted red → amber → info. No data → empty array, never filler.
 *
 * Resilience contract: every table reads inside its own try — one bad table
 * degrades its metric to empty and lands in `degradedSources`; it never zeroes
 * the whole page.
 */

export const dynamic = 'force-dynamic';

const CAP = 12;

/* status vocabularies (mirror cost-control + my-work routes) */
const CLOSED_PROJECT = new Set(['completed', 'complete', 'closed', 'cancelled', 'canceled', 'archived', 'lost']);
const DEAD_PAY_APP = new Set(['rejected', 'void', 'voided', 'cancelled', 'canceled']);
const ACTUAL_INV = new Set(['approved', 'paid', 'partial', 'partially_paid', 'partially paid']);
const RFI_OPEN = new Set(['open', 'submitted', 'under_review', 'pending', 'draft']);
const PUNCH_CLOSED = new Set(['closed', 'complete', 'completed']);
const PUNCH_ITEM_OPEN = new Set(['open', 'in_progress', 'ready_for_review']);

/* insight thresholds — a sentence exists ONLY past these lines */
const BURN_RED = 15;      // burnDelta pct-points ahead of calendar
const BURN_AMBER = 8;
const BURN_UNDER_INFO = -20; // billing far BEHIND calendar (possible underbilling)
const RFI_RED = 21;       // days unanswered
const RFI_AMBER = 14;
const CO_AMBER_PCT = 10;  // approved COs as % of contract
const UNBILLED_AMBER_PCT = 5; // (invoicedCosts − billedToDate) as % of contract
const LOG_GAP_DAYS = 7;   // no daily log in this many days on an active project

const num = (v: unknown): number => Number(v) || 0; // NUMERIC arrives as text — Number() ALWAYS
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** effectiveTotal: a 0/absent `total` defers to amount + tax. */
const effectiveTotal = (r: { total?: unknown; amount?: unknown; tax?: unknown }): number => {
  const t = num(r.total);
  return t !== 0 ? t : num(r.amount) + num(r.tax);
};

/* ── local date-only math (never new Date('YYYY-MM-DD')) ── */
type Ymd = { y: number; m: number; d: number };
const parseDateOnly = (s: unknown): Ymd | null => {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
/** Calendar day index — pure arithmetic, no timezone shift. */
const dayIndex = (p: Ymd): number => Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
const todayYmd = (): Ymd => {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
};
const ymdKey = (p: Ymd): string =>
  `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
const ymdDaysAgo = (base: Ymd, days: number): Ymd => {
  const t = new Date(Date.UTC(base.y, base.m - 1, base.d - days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};

type Severity = 'red' | 'amber' | 'info';
type Insight = { severity: Severity; projectId: string; text: string };
const SEV_RANK: Record<Severity, number> = { red: 0, amber: 1, info: 2 };

/** One bad table never zeroes the page — swallow to [] and record the source. */
async function safeRows(
  label: string,
  q: PromiseLike<{ data: unknown; error: unknown }>,
  degraded: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  try {
    const { data, error } = await q;
    if (error) {
      degraded.push(label);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]) ?? [];
  } catch {
    degraded.push(label);
    return [];
  }
}

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    /* ── project selection (tenant-scoped, cap 12) ── */
    const idsParam = (req.nextUrl.searchParams.get('projectIds') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, CAP);

    let projQuery = db
      .from('projects')
      .select(
        'id, name, status, contract_amount, contract_value, contract_sum, start_date, end_date, last_activity_at, last_log_at, last_rfi_at, last_pay_app_at, last_photo_at, created_at',
      )
      .eq('tenant_id', user.tenantId)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .or('is_archived.is.null,is_archived.eq.false');
    if (idsParam.length > 0) {
      projQuery = projQuery.in('id', idsParam);
    }
    const { data: projRows, error: projErr } = await projQuery
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (projErr) throw projErr;

    const projects = (projRows ?? [])
      .filter((p) => idsParam.length > 0 || !CLOSED_PROJECT.has(String(p.status ?? '').toLowerCase()))
      .slice(0, CAP);

    if (projects.length === 0) {
      return NextResponse.json({
        projects: [],
        totals: null,
        insights: [],
        degradedSources: [],
        generatedAt: new Date().toISOString(),
      });
    }

    const ids = projects.map((p) => p.id);
    const t = user.tenantId;
    const degraded: string[] = [];
    const today = todayYmd();
    const todayIdx = dayIndex(today);
    const logWindowStart = ymdKey(ymdDaysAgo(today, 13)); // last 14 calendar days

    /* ── contract fallback: a job set up through its budget (every ZZ AUDIT job)
       carries 0 in all three contract columns while the budget page shows a
       Total Contract. Σ budget_lines.revised_budget (or original) stands in,
       so the cards stop saying $0.00 for a job that plainly has a number. ── */
    const budgetTotal = new Map<string, number>();
    try {
      const { data: bl } = await db.from('budget_lines').select('project_id, revised_budget, original_budget')
        .eq('tenant_id', t).in('project_id', ids);
      for (const r of (bl ?? []) as Array<{ project_id: string; revised_budget: unknown; original_budget: unknown }>) {
        const v = Number(r.revised_budget) || Number(r.original_budget) || 0;
        budgetTotal.set(r.project_id, (budgetTotal.get(r.project_id) || 0) + v);
      }
    } catch { degraded.push('budget_lines'); }

    /* ── all sources in parallel, each in its own try ── */
    const [payApps, invoices, changeOrders, rfis, punch, dailyLogs] =
      await Promise.all([
        safeRows(
          'pay_applications',
          db
            .from('pay_applications')
            .select('project_id, app_number, total_completed, total_completed_stored, current_payment_due, status')
            .eq('tenant_id', t)
            .in('project_id', ids)
            .is('deleted_at', null),
          degraded,
        ),
        safeRows(
          'invoices',
          db
            .from('invoices')
            .select('project_id, amount, total, tax, status')
            .eq('tenant_id', t)
            .in('project_id', ids),
          degraded,
        ),
        safeRows(
          'change_orders',
          db
            .from('change_orders')
            .select('project_id, amount, status, co_number')
            .eq('tenant_id', t)
            .in('project_id', ids),
          degraded,
        ),
        safeRows(
          'rfis',
          db
            .from('rfis')
            .select('project_id, status, created_at, rfi_number, subject')
            .eq('tenant_id', t)
            .in('project_id', ids)
            .is('deleted_at', null),
          degraded,
        ),
        // ONE punch table. punch_list_items was merged into punch_list with ids
        // preserved, so counting both would double-count every merged row.
        safeRows(
          'punch_list',
          db
            .from('punch_list')
            .select('project_id, status')
            .eq('tenant_id', t)
            .in('project_id', ids)
            .is('deleted_at', null),
          degraded,
        ),
        safeRows(
          'daily_logs',
          db
            .from('daily_logs')
            .select('project_id, log_date')
            .eq('tenant_id', t)
            .in('project_id', ids)
            .gte('log_date', logWindowStart),
          degraded,
        ),
      ]);

    /* ── index every source by project ── */
    const byProject = <T>(rows: Array<T & { project_id?: string | null }>): Map<string, T[]> => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const pid = r.project_id;
        if (!pid) continue;
        const arr = m.get(pid);
        if (arr) arr.push(r);
        else m.set(pid, [r]);
      }
      return m;
    };
    const payByProj = byProject(payApps);
    const invByProj = byProject(invoices);
    const coByProj = byProject(changeOrders);
    const rfiByProj = byProject(rfis);
    const punchByProj = byProject(punch);
    const logsByProj = byProject(dailyLogs);

    const insights: Insight[] = [];

    /* ── per-project computation ── */
    const out = projects.map((p) => {
      const pid = p.id as string;
      const name = String(p.name ?? 'Untitled');

      // money.contract — contract_amount, documented fallback chain
      const contract = num(p.contract_amount) || num(p.contract_value) || num(p.contract_sum) || (budgetTotal.get(p.id) || 0);

      // money.billedToDate — LATEST live pay app's cumulative total_completed
      let billedToDate = 0;
      let latestAppNumber: number | null = null;
      for (const a of payByProj.get(pid) ?? []) {
        if (DEAD_PAY_APP.has(String(a.status ?? '').toLowerCase())) continue;
        const n = num(a.app_number);
        if (latestAppNumber === null || n > latestAppNumber) {
          latestAppNumber = n;
          billedToDate = num(a.total_completed) || num(a.total_completed_stored);
        }
      }

      // money.invoicedCosts — Σ effectiveTotal over approved/paid/partial invoices
      let invoicedCosts = 0;
      for (const inv of invByProj.get(pid) ?? []) {
        if (!ACTUAL_INV.has(String(inv.status ?? '').toLowerCase())) continue;
        invoicedCosts += effectiveTotal(inv);
      }
      invoicedCosts = round2(invoicedCosts);

      // money.approvedCOs
      let coValue = 0;
      let coCount = 0;
      for (const co of coByProj.get(pid) ?? []) {
        if (String(co.status ?? '').toLowerCase() !== 'approved') continue;
        coValue += num(co.amount);
        coCount++;
      }
      coValue = round2(coValue);

      // margin = contract − invoicedCosts ("gross-to-date")
      const margin = round2(contract - invoicedCosts);

      // schedule — linear calendar burn, local date-only math, null when unknowable
      const start = parseDateOnly(p.start_date);
      const end = parseDateOnly(p.end_date);
      let expectedBurnPct: number | null = null;
      if (start && end) {
        const s = dayIndex(start);
        const e = dayIndex(end);
        if (e > s) {
          expectedBurnPct = round1(Math.min(100, Math.max(0, ((todayIdx - s) / (e - s)) * 100)));
        }
      }
      const actualBurnPct = contract > 0 ? round1((invoicedCosts / contract) * 100) : null;
      /* What the OWNER has been billed, which is the only thing that can tell
         you there is unbilled work. */
      const billedPct = contract > 0 ? round1((billedToDate / contract) * 100) : null;
      const burnDelta =
        expectedBurnPct !== null && actualBurnPct !== null
          ? round1(actualBurnPct - expectedBurnPct)
          : null;

      // field — open RFIs + aging
      let openRfis = 0;
      let oldestRfiDays: number | null = null;
      let oldestRfiLabel: string | null = null;
      for (const r of rfiByProj.get(pid) ?? []) {
        if (!RFI_OPEN.has(String(r.status ?? '').toLowerCase())) continue;
        openRfis++;
        if (r.created_at) {
          const ageMs = Date.now() - new Date(String(r.created_at)).getTime();
          if (Number.isFinite(ageMs)) {
            const days = Math.max(0, Math.floor(ageMs / 86400000));
            if (oldestRfiDays === null || days > oldestRfiDays) {
              oldestRfiDays = days;
              oldestRfiLabel = r.rfi_number ? `RFI ${r.rfi_number}` : `RFI "${String(r.subject ?? '').slice(0, 60)}"`;
            }
          }
        }
      }

      // field — open punch from the ONE punch table (punch_list_items was
      // merged in with ids preserved; counting both would double-count).
      let openPunch = 0;
      for (const row of punchByProj.get(pid) ?? []) {
        if (!PUNCH_CLOSED.has(String(row.status ?? '').toLowerCase())) openPunch++;
      }

      // field — daily log streak (consecutive days, last 14; today may be absent)
      const logKeys = new Set<string>();
      let newestLogKey: string | null = null;
      for (const l of logsByProj.get(pid) ?? []) {
        const d = parseDateOnly(l.log_date);
        if (!d) continue;
        const k = ymdKey(d);
        logKeys.add(k);
        if (!newestLogKey || k > newestLogKey) newestLogKey = k;
      }
      let dailyLogStreak = 0;
      for (let i = 0; i < 14; i++) {
        if (logKeys.has(ymdKey(ymdDaysAgo(today, i)))) dailyLogStreak++;
        else if (i === 0) continue; // today isn't over — don't break the streak
        else break;
      }

      // field — lastActivityAt (documented fallback chain, never invented)
      const activityCandidates = [p.last_activity_at, p.last_log_at, p.last_rfi_at, p.last_pay_app_at, p.last_photo_at]
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .sort();
      const lastActivityAt = p.last_activity_at ?? (activityCandidates.length ? activityCandidates[activityCandidates.length - 1] : null);

      /* healthScore — the ONE formula documented at the top of this file */
      const scheduleScore = burnDelta !== null ? Math.max(0, 100 - Math.min(100, Math.abs(burnDelta) * 2)) : null;
      const logScore = Math.min(100, dailyLogStreak * 20);
      const rfiScore = openRfis === 0 ? 100 : Math.max(0, 100 - (oldestRfiDays ?? 0) * 5);
      const fieldScore = 0.5 * logScore + 0.5 * rfiScore;
      const coScore = contract > 0 ? Math.max(0, 100 - Math.min(100, (coValue / contract) * 100 * 5)) : null;

      const parts: Array<{ key: 'schedule' | 'field' | 'coPressure'; weight: number; score: number | null }> = [
        { key: 'schedule', weight: 0.4, score: scheduleScore },
        { key: 'field', weight: 0.3, score: fieldScore },
        { key: 'coPressure', weight: 0.3, score: coScore },
      ];
      const live = parts.filter((c) => c.score !== null) as Array<{ key: string; weight: number; score: number }>;
      const weightSum = live.reduce((s, c) => s + c.weight, 0);
      const healthScore =
        weightSum > 0 ? Math.round(live.reduce((s, c) => s + c.weight * c.score, 0) / weightSum) : null;

      /* insights — sentences only past thresholds */
      if (burnDelta !== null && burnDelta >= BURN_AMBER) {
        insights.push({
          severity: burnDelta >= BURN_RED ? 'red' : 'amber',
          projectId: pid,
          text: `${name} is spending ${round1(burnDelta)}% ahead of schedule (${actualBurnPct}% of contract in costs vs ${expectedBurnPct}% of calendar elapsed).`,
        });
      }
      /* Unbilled work is a BILLING question, so it is asked of billedPct. This
         used to be asked of actualBurnPct — the cost burn — so a job that had
         billed the owner in full but run at a healthy 78.7% of contract in
         costs was told it had "invoiced only 78.7% of contract, check for
         unbilled work". That is a PM sent hunting for work that was billed
         months ago, on the strength of a number that was actually its margin. */
      if (billedPct !== null && expectedBurnPct !== null && expectedBurnPct > 0
          && round1(billedPct - expectedBurnPct) <= BURN_UNDER_INFO) {
        insights.push({
          severity: 'info',
          projectId: pid,
          text: `${name} has billed only ${billedPct}% of contract with ${expectedBurnPct}% of the calendar gone — check for unbilled work.`,
        });
      }
      if (oldestRfiDays !== null && oldestRfiDays >= RFI_AMBER && oldestRfiLabel) {
        insights.push({
          severity: oldestRfiDays >= RFI_RED ? 'red' : 'amber',
          projectId: pid,
          text: `${oldestRfiLabel} on ${name} has been unanswered ${oldestRfiDays} days.`,
        });
      }
      if (contract > 0 && (coValue / contract) * 100 >= CO_AMBER_PCT) {
        insights.push({
          severity: 'amber',
          projectId: pid,
          text: `Approved change orders have added ${round1((coValue / contract) * 100)}% ($${Math.round(coValue).toLocaleString('en-US')}) to ${name}'s contract.`,
        });
      }
      if (contract > 0 && invoicedCosts > billedToDate && ((invoicedCosts - billedToDate) / contract) * 100 >= UNBILLED_AMBER_PCT) {
        insights.push({
          severity: 'amber',
          projectId: pid,
          text: `${name} has $${Math.round(invoicedCosts - billedToDate).toLocaleString('en-US')} of invoiced costs not yet billed to the owner.`,
        });
      }
      if (!degraded.includes('daily_logs')) {
        const gapKey = ymdKey(ymdDaysAgo(today, LOG_GAP_DAYS));
        if (!newestLogKey || newestLogKey < gapKey) {
          insights.push({
            severity: 'info',
            projectId: pid,
            text: `No daily logs filed on ${name} in the last ${LOG_GAP_DAYS} days.`,
          });
        }
      }

      return {
        projectId: pid,
        name,
        status: p.status ?? null,
        money: {
          contract: round2(contract),
          billedToDate: round2(billedToDate),
          invoicedCosts,
          approvedCOs: { value: coValue, count: coCount },
          margin,
          marginLabel: 'gross-to-date',
        },
        schedule: {
          startDate: p.start_date ?? null,
          endDate: p.end_date ?? null,
          expectedBurnPct,
          actualBurnPct,
          burnDelta,
        },
        field: {
          openRfis,
          oldestRfiDays,
          openPunch,
          dailyLogStreak,
          lastActivityAt,
        },
        health: {
          score: healthScore,
          components: {
            schedule: { score: scheduleScore !== null ? Math.round(scheduleScore) : null, weight: 0.4 },
            field: { score: Math.round(fieldScore), weight: 0.3 },
            coPressure: { score: coScore !== null ? Math.round(coScore) : null, weight: 0.3 },
          },
        },
      };
    });

    /* ── totals across selected projects ── */
    const sum = (f: (p: (typeof out)[number]) => number) => round2(out.reduce((s, p) => s + f(p), 0));
    const totalContract = sum((p) => p.money.contract);
    const totalInvoiced = sum((p) => p.money.invoicedCosts);
    const scores = out.map((p) => p.health.score).filter((s): s is number => s !== null);
    const totals = {
      projects: out.length,
      contract: totalContract,
      billedToDate: sum((p) => p.money.billedToDate),
      invoicedCosts: totalInvoiced,
      approvedCOs: {
        value: sum((p) => p.money.approvedCOs.value),
        count: out.reduce((s, p) => s + p.money.approvedCOs.count, 0),
      },
      margin: round2(totalContract - totalInvoiced),
      marginLabel: 'gross-to-date',
      openRfis: out.reduce((s, p) => s + p.field.openRfis, 0),
      openPunch: out.reduce((s, p) => s + p.field.openPunch, 0),
      actualBurnPct: totalContract > 0 ? round1((totalInvoiced / totalContract) * 100) : null,
      avgHealthScore: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
    };

    const topInsights = insights
      .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
      .slice(0, 6);

    return NextResponse.json({
      projects: out,
      totals,
      insights: topInsights,
      degradedSources: degraded,
      sources: {
        contract: 'projects.contract_amount (fallback contract_value, contract_sum, then Σ budget_lines.revised_budget)',
        billedToDate: 'latest live pay_applications.total_completed (fallback total_completed_stored)',
        invoicedCosts: 'invoices total (0 total defers to amount+tax) where status in approved/paid/partial',
        approvedCOs: 'change_orders.amount where status = approved',
        margin: 'contract - invoicedCosts (gross-to-date)',
        expectedBurnPct: 'linear start_date→end_date calendar position; null when dates missing',
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[intelligence/summary/GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
