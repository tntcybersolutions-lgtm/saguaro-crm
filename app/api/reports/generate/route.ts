import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import {
  DEMO_PROJECT,
  DEMO_SUBS,
  DEMO_PAY_APPS,
  DEMO_RFIS,
  DEMO_CHANGE_ORDERS,
  DEMO_BUDGET_LINES,
} from '../../../../demo-data';

function buildDemoReport(reportType: string, format: string) {
  const timestamp = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  switch (reportType) {
    case 'job-cost':
      return {
        message: `Job Cost Report generated (${timestamp})`,
        reportType,
        format,
        title: 'Job Cost Summary',
        columns: ['Cost Code', 'Description', 'Original Budget', 'Committed', 'Actual Cost', 'Forecast', 'Variance'],
        rows: DEMO_BUDGET_LINES.map(l => [
          l.cost_code,
          l.description,
          `$${l.original_budget.toLocaleString()}`,
          `$${l.committed_cost.toLocaleString()}`,
          `$${l.actual_cost.toLocaleString()}`,
          `$${l.forecast_cost.toLocaleString()}`,
          `$${(l.original_budget - l.forecast_cost).toLocaleString()}`,
        ]),
        totals: {
          original_budget: DEMO_BUDGET_LINES.reduce((s, l) => s + l.original_budget, 0),
          committed_cost: DEMO_BUDGET_LINES.reduce((s, l) => s + l.committed_cost, 0),
          actual_cost: DEMO_BUDGET_LINES.reduce((s, l) => s + l.actual_cost, 0),
          forecast_cost: DEMO_BUDGET_LINES.reduce((s, l) => s + l.forecast_cost, 0),
        },
      };

    case 'bid-win-loss':
      return {
        message: `Bid Win/Loss Summary generated (${timestamp})`,
        reportType,
        format,
        title: 'Bid Win/Loss Analysis',
        columns: ['Trade', 'Total Bids', 'Won', 'Lost', 'Win Rate', 'Avg Winning Margin'],
        rows: [
          ['Residential', '7', '5', '2', '71%', '18.2%'],
          ['Commercial', '3', '0', '3', '0%', 'N/A'],
          ['Addition/Remodel', '2', '2', '0', '100%', '20.1%'],
          ['Healthcare', '1', '1', '0', '100%', '14.5%'],
        ],
        totals: { total: 13, won: 8, lost: 5, win_rate: '61.5%' },
      };

    case 'schedule-variance':
      return {
        message: `Schedule Variance Report generated (${timestamp})`,
        reportType,
        format,
        title: 'Schedule Variance Report',
        columns: ['Milestone', 'Planned Date', 'Forecast Date', 'Variance (Days)', 'Status'],
        rows: [
          ['Foundation Complete', '2026-02-15', '2026-02-18', '+3', 'Delayed'],
          ['Structural Steel', '2026-03-30', '2026-04-02', '+3', 'At Risk'],
          ['MEP Rough-In', '2026-05-15', '2026-05-15', '0', 'On Track'],
          ['Drywall Complete', '2026-06-30', '2026-06-30', '0', 'On Track'],
          ['Substantial Completion', '2026-09-30', '2026-10-06', '+6', 'At Risk'],
        ],
      };

    case 'pay-app-status':
      return {
        message: `Pay Application Status generated (${timestamp})`,
        reportType,
        format,
        title: 'Pay Application Log',
        columns: ['Pay App #', 'Period', 'Billed', 'Retainage', 'Net Due', 'Status'],
        rows: DEMO_PAY_APPS.map(pa => [
          `#${pa.application_number}`,
          `${pa.period_from} – ${pa.period_to}`,
          `$${pa.total_completed_and_stored.toLocaleString()}`,
          `$${pa.retainage_held.toLocaleString()}`,
          `$${pa.current_payment_due.toLocaleString()}`,
          pa.status.toUpperCase(),
        ]),
        totals: {
          total_billed: DEMO_PAY_APPS.reduce((s, pa) => s + pa.total_completed_and_stored, 0),
          total_retainage: DEMO_PAY_APPS.reduce((s, pa) => s + pa.retainage_held, 0),
          total_paid: DEMO_PAY_APPS.filter(pa => pa.status === 'paid').reduce((s, pa) => s + pa.current_payment_due, 0),
        },
      };

    case 'lien-waiver-log':
      return {
        message: `Lien Waiver Log generated (${timestamp})`,
        reportType,
        format,
        title: 'Lien Waiver Status Matrix',
        columns: ['Subcontractor', 'Trade', 'Pay App #1', 'Pay App #2', 'Pay App #3', 'Unconditional Final'],
        rows: DEMO_SUBS.map(s => [
          s.name, s.trade, 'Collected', 'Collected', 'Pending', 'N/A',
        ]),
      };

    case 'insurance-compliance':
      return {
        message: `Insurance Compliance Report generated (${timestamp})`,
        reportType,
        format,
        title: 'Insurance Compliance Matrix',
        columns: ['Subcontractor', 'Trade', 'GL Policy', 'GL Expiry', 'WC Policy', 'WC Expiry', 'Status'],
        rows: DEMO_SUBS.map((s, i) => [
          s.name, s.trade,
          `GL-2026-00${i + 1}`, i === 1 ? '2026-03-25' : '2026-12-31',
          `WC-2026-00${i + 1}`, '2026-12-31',
          i === 1 ? 'EXPIRING SOON' : 'CURRENT',
        ]),
      };

    case 'autopilot-alerts':
      return {
        message: `Autopilot Alert History generated (${timestamp})`,
        reportType,
        format,
        title: 'Autopilot Alert History',
        columns: ['Alert', 'Severity', 'Type', 'Project', 'Status', 'Date'],
        rows: [
          ['Overdue RFI: RFI-002', 'HIGH', 'RFI', DEMO_PROJECT.name, 'Open', '2026-03-05'],
          ['Invoice Overdue: Rio Framing', 'MEDIUM', 'Invoice', DEMO_PROJECT.name, 'Open', '2026-03-03'],
          ['Project Risk Rollup', 'HIGH', 'Project', DEMO_PROJECT.name, 'Open', '2026-03-06'],
        ],
      };

    case 'rfi-log':
      return {
        message: `RFI Log generated (${timestamp})`,
        reportType,
        format,
        title: 'RFI Log',
        columns: ['RFI #', 'Title', 'Status', 'Priority', 'Due Date', 'Responded', 'Cost Impact', 'Schedule Impact'],
        rows: DEMO_RFIS.map(r => [
          r.number, r.title, r.status.replace('_', ' ').toUpperCase(), r.priority.toUpperCase(),
          r.response_due_date, r.responded_at ?? 'Pending',
          r.cost_impact_amount ? `$${r.cost_impact_amount.toLocaleString()}` : '$0',
          r.schedule_impact_days ? `${r.schedule_impact_days} days` : 'None',
        ]),
      };

    default:
      return {
        message: `Report generated (${timestamp})`,
        reportType,
        format,
        title: reportType,
        columns: ['Item', 'Value'],
        rows: [['Demo data', 'Connect Supabase for live data']],
      };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { reportType = 'job-cost', format = 'pdf' } = body;

    const user = await getUser(req);

    if (!user) {
      const report = buildDemoReport(reportType, format);
      return NextResponse.json({ ...report, source: 'demo' });
    }

    // In production, query real data and build real report
    // For now, use demo data structure
    const db = createServerClient();
    const tenantId = user.id;

    try {
      // Attempt real data queries based on report type
      if (reportType === 'pay-app-status') {
        const { data: payApps } = await db
          .from('pay_applications')
          .select('*, projects(name)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (payApps && payApps.length > 0) {
          return NextResponse.json({
            message: `Pay Application Report generated — ${payApps.length} records`,
            reportType,
            format,
            title: 'Pay Application Log',
            columns: ['Pay App #', 'Project', 'Period', 'Billed', 'Net Due', 'Status'],
            rows: payApps.map((pa: any) => [
              `#${pa.application_number ?? pa.app_number}`,
              pa.projects?.name ?? 'Unknown',
              pa.period_to ?? '',
              `$${(pa.total_completed_and_stored ?? 0).toLocaleString()}`,
              `$${(pa.current_payment_due ?? 0).toLocaleString()}`,
              (pa.status ?? '').toUpperCase(),
            ]),
            source: 'live',
          });
        }
      }

      if (reportType === 'rfi-log') {
        const { data: rfis } = await db
          .from('rfis')
          .select('*, projects(name)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (rfis && rfis.length > 0) {
          return NextResponse.json({
            message: `RFI Log generated — ${rfis.length} records`,
            reportType,
            format,
            title: 'RFI Log',
            columns: ['RFI #', 'Project', 'Title', 'Status', 'Due Date'],
            rows: rfis.map((r: any) => [
              r.rfi_number ?? r.number ?? '#',
              r.projects?.name ?? 'Unknown',
              r.subject ?? r.title ?? '',
              (r.status ?? '').replace('_', ' ').toUpperCase(),
              r.response_due_date ?? r.due_date ?? '',
            ]),
            source: 'live',
          });
        }
      }
    } catch {
      // Fall through to demo data
    }

    const report = buildDemoReport(reportType, format);
    return NextResponse.json({ ...report, source: 'demo' });
  } catch {
    return NextResponse.json({
      message: 'Report generated successfully',
      reportType: 'unknown',
      format: 'pdf',
      title: 'Report',
      columns: ['Item', 'Status'],
      rows: [['Demo mode', 'Active']],
      source: 'fallback',
    });
  }
}
