import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const REPORT_CONFIGS: Record<string, { title: string; columns: string[] }> = {
  'job-cost':           { title: 'Job Cost Summary',         columns: ['Cost Code', 'Description', 'Original Budget', 'Committed', 'Actual Cost', 'Forecast', 'Variance'] },
  'bid-win-loss':       { title: 'Bid Win/Loss Analysis',    columns: ['Trade', 'Total Bids', 'Won', 'Lost', 'Win Rate', 'Avg Winning Margin'] },
  'schedule-variance':  { title: 'Schedule Variance Report', columns: ['Milestone', 'Planned Date', 'Forecast Date', 'Variance (Days)', 'Status'] },
  'pay-app-status':     { title: 'Pay Application Log',      columns: ['Pay App #', 'Project', 'Period', 'Billed', 'Net Due', 'Status'] },
  'lien-waiver-log':    { title: 'Lien Waiver Status Matrix',columns: ['Subcontractor', 'Trade', 'Pay App #1', 'Pay App #2', 'Pay App #3', 'Final'] },
  'insurance-compliance': { title: 'Insurance Compliance Matrix', columns: ['Subcontractor', 'Trade', 'GL Policy', 'GL Expiry', 'WC Policy', 'WC Expiry', 'Status'] },
  'autopilot-alerts':   { title: 'Autopilot Alert History',  columns: ['Alert', 'Severity', 'Type', 'Project', 'Status', 'Date'] },
  'rfi-log':            { title: 'RFI Log',                  columns: ['RFI #', 'Project', 'Title', 'Status', 'Due Date'] },
  'change-order-log':   { title: 'Change Order Log',         columns: ['CO #', 'Project', 'Title', 'Status', 'Cost Impact', 'Days'] },
  'sub-compliance':     { title: 'Subcontractor Compliance', columns: ['Subcontractor', 'Trade', 'W-9', 'Insurance', 'Status'] },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { reportType = 'job-cost', format = 'pdf', projectId } = body;

    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const tenantId = user.tenantId;
    const timestamp = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const config = REPORT_CONFIGS[reportType] || { title: reportType, columns: ['Item', 'Value'] };

    try {
      if (reportType === 'pay-app-status') {
        let q = db.from('pay_applications').select('*, projects(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50);
        if (projectId) q = q.eq('project_id', projectId);
        const { data: payApps } = await q;
        return NextResponse.json({
          message: `Pay Application Report — ${(payApps || []).length} records (${timestamp})`,
          reportType, format, title: config.title, columns: config.columns,
          rows: (payApps || []).map((pa: any) => [
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

      if (reportType === 'rfi-log') {
        let q = db.from('rfis').select('*, projects(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100);
        if (projectId) q = q.eq('project_id', projectId);
        const { data: rfis } = await q;
        return NextResponse.json({
          message: `RFI Log — ${(rfis || []).length} records (${timestamp})`,
          reportType, format, title: config.title, columns: config.columns,
          rows: (rfis || []).map((r: any) => [
            r.rfi_number ?? r.number ?? '#',
            r.projects?.name ?? 'Unknown',
            r.subject ?? r.title ?? '',
            (r.status ?? '').replace('_', ' ').toUpperCase(),
            r.response_due_date ?? r.due_date ?? '',
          ]),
          source: 'live',
        });
      }

      if (reportType === 'change-order-log') {
        let q = db.from('change_orders').select('*, projects(name)').eq('tenant_id', tenantId).order('co_number', { ascending: false }).limit(100);
        if (projectId) q = q.eq('project_id', projectId);
        const { data: cos } = await q;
        return NextResponse.json({
          message: `Change Order Log — ${(cos || []).length} records (${timestamp})`,
          reportType, format, title: config.title, columns: config.columns,
          rows: (cos || []).map((co: any) => [
            `CO-${co.co_number ?? '?'}`,
            co.projects?.name ?? 'Unknown',
            co.title ?? '',
            (co.status ?? '').toUpperCase(),
            `$${(co.cost_impact ?? 0).toLocaleString()}`,
            co.schedule_impact ? `${co.schedule_impact} days` : '0',
          ]),
          source: 'live',
        });
      }

      if (reportType === 'lien-waiver-log') {
        let q = db.from('lien_waivers').select('*, subcontractors(name, trade), projects(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100);
        if (projectId) q = q.eq('project_id', projectId);
        const { data: waivers } = await q;
        return NextResponse.json({
          message: `Lien Waiver Log — ${(waivers || []).length} records (${timestamp})`,
          reportType, format, title: config.title, columns: config.columns,
          rows: (waivers || []).map((w: any) => [
            w.subcontractors?.name ?? 'Unknown',
            w.subcontractors?.trade ?? '',
            w.waiver_type ?? w.type ?? '',
            w.amount ? `$${w.amount.toLocaleString()}` : '',
            (w.status ?? '').toUpperCase(),
            w.signed_at ? 'Signed' : 'Pending',
          ]),
          source: 'live',
        });
      }

      if (reportType === 'insurance-compliance') {
        let q = db.from('insurance_certificates').select('*, subcontractors(name, trade), projects(name)').eq('tenant_id', tenantId).order('expiry_date', { ascending: true }).limit(100);
        if (projectId) q = q.eq('project_id', projectId);
        const { data: certs } = await q;
        const today = new Date().toISOString().split('T')[0];
        return NextResponse.json({
          message: `Insurance Compliance — ${(certs || []).length} records (${timestamp})`,
          reportType, format, title: config.title, columns: config.columns,
          rows: (certs || []).map((c: any) => {
            const expiring = c.expiry_date && c.expiry_date < new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            const expired = c.expiry_date && c.expiry_date < today;
            return [
              c.subcontractors?.name ?? 'Unknown',
              c.subcontractors?.trade ?? '',
              c.policy_number ?? '',
              c.expiry_date ?? '',
              c.policy_type ?? '',
              c.expiry_date ?? '',
              expired ? 'EXPIRED' : expiring ? 'EXPIRING SOON' : 'CURRENT',
            ];
          }),
          source: 'live',
        });
      }

      if (reportType === 'job-cost') {
        let q = db.from('budget_lines').select('*, projects(name)').eq('tenant_id', tenantId).order('created_at', { ascending: true }).limit(100);
        if (projectId) q = q.eq('project_id', projectId);
        const { data: lines } = await q;
        return NextResponse.json({
          message: `Job Cost Report — ${(lines || []).length} cost codes (${timestamp})`,
          reportType, format, title: config.title, columns: config.columns,
          rows: (lines || []).map((l: any) => [
            l.cost_code ?? '',
            l.description ?? '',
            `$${(l.original_budget ?? 0).toLocaleString()}`,
            `$${(l.committed_cost ?? 0).toLocaleString()}`,
            `$${(l.actual_cost ?? 0).toLocaleString()}`,
            `$${(l.forecast_cost ?? l.original_budget ?? 0).toLocaleString()}`,
            `$${((l.original_budget ?? 0) - (l.forecast_cost ?? l.original_budget ?? 0)).toLocaleString()}`,
          ]),
          source: 'live',
        });
      }

      if (reportType === 'autopilot-alerts') {
        let q = db.from('autopilot_alerts').select('*, projects(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100);
        if (projectId) q = q.eq('project_id', projectId);
        const { data: alerts } = await q;
        return NextResponse.json({
          message: `Autopilot Alert History — ${(alerts || []).length} alerts (${timestamp})`,
          reportType, format, title: config.title, columns: config.columns,
          rows: (alerts || []).map((a: any) => [
            a.title ?? a.message ?? '',
            (a.severity ?? a.urgency ?? 'medium').toUpperCase(),
            a.type ?? '',
            a.projects?.name ?? 'Unknown',
            (a.status ?? 'open').toUpperCase(),
            a.created_at ? new Date(a.created_at).toLocaleDateString() : '',
          ]),
          source: 'live',
        });
      }

      // Generic fallback for other report types
      return NextResponse.json({
        message: `${config.title} generated (${timestamp})`,
        reportType, format, title: config.title, columns: config.columns,
        rows: [],
        source: 'live',
      });

    } catch {
      return NextResponse.json({
        message: `${config.title} — no data yet (${timestamp})`,
        reportType, format, title: config.title, columns: config.columns,
        rows: [],
        source: 'live',
      });
    }
  } catch {
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
  }
}
