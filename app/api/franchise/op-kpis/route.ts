import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { hasFeature } from '@/lib/entitlements-server';
import { inspectionOutcome } from '@/lib/inspection-result';
import { liveJobs } from '@/lib/live-jobs';

const DAY = 86400000;
const days = (a: any, b: any): number | null => {
  const ta = Date.parse(String(a || '')), tb = Date.parse(String(b || ''));
  if (isNaN(ta) || isNaN(tb)) return null;
  const d = Math.round((tb - ta) / DAY);
  return d < 0 ? null : d;
};
const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

/**
 * Operational cycle-time KPIs for the Franchise Rollout dashboard.
 * FAIL-CLOSED + tenant-scoped. Every metric is computed from real columns;
 * a metric with no qualifying rows returns null (the UI shows "—").
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requirePermission(req, 'Reports', 'View', { projectId: null });
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) return NextResponse.json({ kpis: {} }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ kpis: {}, gated: true }, { status: 403 });

    const db = createServerClient() as any;
    const t = { tenant_id: user.tenantId };
    const [{ data: cosRows }, { data: rfiRows }, { data: permitRows }, { data: inspRows }, { data: punchRows }, { data: projs }, { data: subRows }] = await Promise.all([
      db.from('change_orders').select('project_id,created_at,approved_at,status').match(t),
      db.from('rfis').select('project_id,created_at,answered_at,answered_date,days_to_respond,due_date,status').match(t),
      db.from('permits').select('project_id,application_date,applied_date,issue_date,issued_date,plan_review_submitted_date,plan_review_approved_date').match(t),
      db.from('inspections').select('project_id,result,status').match(t),
      db.from('punch_list').select('project_id,created_at,completed_at,status').match(t),
      liveJobs(db.from('projects').select('id,actual_start_date,start_date,notice_to_proceed_date,ntp_date,closeout_date,occupancy_date,substantial_completion_date').match(t)),
      db.from('submittals').select('project_id,submitted_at,returned_at,reviewed_at,days_to_review,due_date,status').match(t),
    ]);
    // Archived and deleted jobs are off the scorecard, with everything on them.
    const live = new Set(((projs || []) as any[]).map((p) => p.id));
    const onLive = (rows: any[] | null) => (rows || []).filter((r: any) => !r.project_id || live.has(r.project_id));
    const cos = onLive(cosRows), rfis = onLive(rfiRows), permits = onLive(permitRows);
    const insp = onLive(inspRows), punch = onLive(punchRows), subs = onLive(subRows);

    // CO approval time (created → approved)
    const coTimes = (cos || []).filter((c: any) => /approved/i.test(String(c.status || '')) && c.approved_at)
      .map((c: any) => days(c.created_at, c.approved_at)).filter((x: any): x is number => x != null);

    // RFI response time (days_to_respond, else created → answered)
    const rfiTimes = (rfis || []).map((r: any) => {
      if (r.days_to_respond != null && Number(r.days_to_respond) >= 0) return Number(r.days_to_respond);
      return days(r.created_at, r.answered_at || r.answered_date);
    }).filter((x: any): x is number => x != null);

    // Permit issue time (application → issue); plan review time as a bonus
    const permitTimes = (permits || []).map((p: any) => days(p.application_date || p.applied_date, p.issue_date || p.issued_date)).filter((x: any): x is number => x != null);
    const planReviewTimes = (permits || []).map((p: any) => days(p.plan_review_submitted_date, p.plan_review_approved_date)).filter((x: any): x is number => x != null);

    // Inspection pass rate
    // A booked inspection is not a result (it may carry the column's old 'pass' default).
    const withResult = (insp || []).filter((i: any) => inspectionOutcome(i) !== 'pending');
    const passed = withResult.filter((i: any) => inspectionOutcome(i) !== 'failed');
    const passRate = withResult.length ? Math.round((passed.length / withResult.length) * 100) : null;

    // Punch-list resolution duration (created → completed) — only closed items.
    const punchTimes = (punch || []).filter((x: any) => x.completed_at)
      .map((x: any) => days(x.created_at, x.completed_at)).filter((x: any): x is number => x != null);

    // Days-to-closeout (construction start → C-of-O / closeout) — only closed-out sites.
    const closeoutTimes = (projs || []).map((p: any) =>
      days(p.actual_start_date || p.notice_to_proceed_date || p.ntp_date || p.start_date, p.closeout_date || p.occupancy_date || p.substantial_completion_date)
    ).filter((x: any): x is number => x != null);

    // Architect Response Time — architect reviews submittals (submitted → returned/reviewed).
    const archTimes = (subs || []).map((s: any) => {
      if (s.days_to_review != null && Number(s.days_to_review) >= 0) return Number(s.days_to_review);
      return days(s.submitted_at, s.returned_at || s.reviewed_at);
    }).filter((x: any): x is number => x != null);

    // GC Performance index (0–100): equal-weight blend of the components with data —
    // quality (inspection pass rate), RFI on-time (≤5 business days per spec target),
    // and submittal on-time (returned by due date). A real, explainable GC scorecard.
    const answeredRfis = (rfis || []).filter((r: any) => r.days_to_respond != null || r.answered_at || r.answered_date);
    const rfiOnTime = answeredRfis.filter((r: any) => {
      const d = r.days_to_respond != null ? Number(r.days_to_respond) : days(r.created_at, r.answered_at || r.answered_date);
      return d != null && d <= 5;
    });
    const reviewedSubs = (subs || []).filter((s: any) => s.returned_at || s.reviewed_at || s.days_to_review != null);
    const subsOnTime = reviewedSubs.filter((s: any) => {
      if (!s.due_date) { const d = s.days_to_review != null ? Number(s.days_to_review) : null; return d != null && d <= 3; }
      const ret = s.returned_at || s.reviewed_at;
      return ret ? Date.parse(String(ret)) <= Date.parse(String(s.due_date)) + DAY : false;
    });
    const gcParts: number[] = [];
    if (withResult.length) gcParts.push(passRate as number);
    if (answeredRfis.length) gcParts.push(Math.round((rfiOnTime.length / answeredRfis.length) * 100));
    if (reviewedSubs.length) gcParts.push(Math.round((subsOnTime.length / reviewedSubs.length) * 100));
    const gcPerformance = gcParts.length ? Math.round(gcParts.reduce((a, b) => a + b, 0) / gcParts.length) : null;

    return NextResponse.json({
      kpis: {
        coApprovalDays: avg(coTimes),          coApprovalN: coTimes.length,
        rfiResponseDays: avg(rfiTimes),         rfiResponseN: rfiTimes.length,
        permitIssueDays: avg(permitTimes),      permitIssueN: permitTimes.length,
        planReviewDays: avg(planReviewTimes),   planReviewN: planReviewTimes.length,
        inspectionPassRate: passRate,           inspectionN: withResult.length,
        punchDurationDays: avg(punchTimes),     punchN: punchTimes.length,
        closeoutDays: avg(closeoutTimes),       closeoutN: closeoutTimes.length,
        architectResponseDays: avg(archTimes),  architectN: archTimes.length,
        gcPerformance,                          gcPerformanceN: gcParts.length,
      },
    });
  } catch {
    return NextResponse.json({ kpis: {}, source: 'error' });
  }
}
