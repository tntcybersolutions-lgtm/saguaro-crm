// ─────────────────────────────────────────────────────────────────────────────
// lib/reports/generate.ts
//
// Shared, tenant-scoped "canned report" engine. Maps a reportType key to a REAL,
// live query against the tenant's data and returns a uniform { title, columns,
// rows } shape (rows are pre-formatted string cells, aligned to columns).
//
// This is the SINGLE source of truth used by both POST /api/reports/generate
// (interactive) and the scheduled-report cron (app/api/cron/report-schedules).
//
// The caller MUST pass a trusted tenantId (getUser(...).tenantId, or a cron loop
// over tenants.id). Every query is scoped with eq('tenant_id', tenantId).
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { toCents, toDollars, subCents } from '@/lib/calc';
import { addDays, dayIn } from '@/lib/time-zone';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const REPORT_CONFIGS: Record<string, { title: string; columns: string[] }> = {
  'job-cost':             { title: 'Job Cost Summary',              columns: ['Cost Code', 'Description', 'Original Budget', 'Committed', 'Actual Cost', 'Forecast', 'Variance'] },
  'bid-win-loss':         { title: 'Bid Win/Loss Analysis',         columns: ['Trade', 'Total Bids', 'Won', 'Lost', 'Win Rate', 'Avg Winning Margin'] },
  'schedule-variance':    { title: 'Schedule Variance Report',      columns: ['Milestone', 'Planned Date', 'Forecast Date', 'Variance (Days)', 'Status'] },
  'pay-app-status':       { title: 'Pay Application Log',           columns: ['Pay App #', 'Project', 'Period', 'Billed', 'Net Due', 'Status'] },
  'lien-waiver-log':      { title: 'Lien Waiver Status Matrix',     columns: ['Subcontractor', 'Trade', 'Pay App #1', 'Pay App #2', 'Pay App #3', 'Final'] },
  'insurance-compliance': { title: 'Insurance Compliance Matrix',   columns: ['Subcontractor', 'Trade', 'GL Policy', 'GL Expiry', 'WC Policy', 'WC Expiry', 'Status'] },
  'autopilot-alerts':     { title: 'Autopilot Alert History',       columns: ['Alert', 'Severity', 'Type', 'Project', 'Status', 'Date'] },
  'rfi-log':              { title: 'RFI Log',                       columns: ['RFI #', 'Project', 'Title', 'Status', 'Due Date'] },
  'change-order-log':     { title: 'Change Order Log',              columns: ['CO #', 'Project', 'Title', 'Status', 'Cost Impact', 'Days'] },
  'sub-compliance':       { title: 'Subcontractor Compliance',      columns: ['Subcontractor', 'Trade', 'W-9', 'Insurance', 'Status'] },
};

/**
 * Some UIs use slightly different keys than the canonical REPORT_CONFIGS ids
 * (e.g. the main reports page uses `change-order`, `lien-waiver`, `insurance`,
 * `pay-app`). Normalize those to the canonical id so a scheduled report saved
 * under any of them still resolves to a real query.
 */
const REPORT_TYPE_ALIASES: Record<string, string> = {
  'change-order': 'change-order-log',
  'change_order_log': 'change-order-log',
  'lien-waiver': 'lien-waiver-log',
  'lien_waiver_log': 'lien-waiver-log',
  'insurance': 'insurance-compliance',
  'insurance_compliance': 'insurance-compliance',
  'pay-app': 'pay-app-status',
  'pay_app_status': 'pay-app-status',
  'rfi': 'rfi-log',
  'rfi_log': 'rfi-log',
  'job_cost': 'job-cost',
  'jobcost': 'job-cost',
  'autopilot': 'autopilot-alerts',
  'autopilot_alerts': 'autopilot-alerts',
};

export function normalizeReportType(reportType: string): string {
  const key = String(reportType || '').trim();
  return REPORT_TYPE_ALIASES[key] || key;
}

/** True when we have a real, live query for this reportType (after alias normalization). */
export function isRunnableReportType(reportType: string): boolean {
  const key = normalizeReportType(reportType);
  return key === 'pay-app-status' || key === 'rfi-log' || key === 'change-order-log'
    || key === 'lien-waiver-log' || key === 'insurance-compliance' || key === 'job-cost'
    || key === 'autopilot-alerts';
}

export interface GeneratedReport {
  reportType: string;
  title: string;
  columns: string[];
  rows: string[][];
  count: number;
  /** 'live' when a real per-type query ran; 'empty' when no live query exists for the type. */
  source: 'live' | 'empty';
  message: string;
}

/**
 * Run a canned report against live tenant data. Returns real rows for the
 * supported reportTypes; for anything else returns an honest empty result
 * (source:'empty') rather than fabricating rows.
 *
 * `opts.timeZone` is the company's clock the report is dated on and judged in
 * ("expired", "expiring soon") — the reader's device zone, else the company's
 * (lib/time-zone). The server's UTC day called a COI expiring today EXPIRED
 * from 7 PM on in Iowa.
 */
export async function generateReportData(
  db: SupabaseClient,
  tenantId: string,
  reportTypeRaw: string,
  projectId: string | null | undefined,
  opts: { timeZone: string },
): Promise<GeneratedReport> {
  const reportType = normalizeReportType(reportTypeRaw);
  const timestamp = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: opts.timeZone });
  const today = dayIn(opts.timeZone);
  const config = REPORT_CONFIGS[reportType] || { title: reportTypeRaw || 'Report', columns: ['Item', 'Value'] };
  const anyDb = db as any;

  try {
    if (reportType === 'pay-app-status') {
      let q = anyDb.from('pay_applications').select('*, projects(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50);
      if (projectId) q = q.eq('project_id', projectId);
      const { data: payApps } = await q;
      const rows = (payApps || []).map((pa: any) => [
        `#${pa.application_number ?? pa.app_number}`,
        pa.projects?.name ?? 'Unknown',
        pa.period_to ?? '',
        `$${(pa.total_completed_stored ?? 0).toLocaleString()}`,
        `$${(pa.current_payment_due ?? 0).toLocaleString()}`,
        (pa.status ?? '').toUpperCase(),
      ]);
      return { reportType, title: config.title, columns: config.columns, rows, count: rows.length, source: 'live', message: `Pay Application Report — ${rows.length} records (${timestamp})` };
    }

    if (reportType === 'rfi-log') {
      let q = anyDb.from('rfis').select('*, projects(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100);
      if (projectId) q = q.eq('project_id', projectId);
      const { data: rfis } = await q;
      const rows = (rfis || []).map((r: any) => [
        r.rfi_number ?? r.number ?? '#',
        r.projects?.name ?? 'Unknown',
        r.subject ?? r.title ?? '',
        (r.status ?? '').replace('_', ' ').toUpperCase(),
        r.response_due_date ?? r.due_date ?? '',
      ]);
      return { reportType, title: config.title, columns: config.columns, rows, count: rows.length, source: 'live', message: `RFI Log — ${rows.length} records (${timestamp})` };
    }

    if (reportType === 'change-order-log') {
      let q = anyDb.from('change_orders').select('*, projects(name)').eq('tenant_id', tenantId).order('co_number', { ascending: false }).limit(100);
      if (projectId) q = q.eq('project_id', projectId);
      const { data: cos } = await q;
      const rows = (cos || []).map((co: any) => [
        `CO-${co.co_number ?? '?'}`,
        co.projects?.name ?? 'Unknown',
        co.title ?? '',
        (co.status ?? '').toUpperCase(),
        `$${(co.cost_impact ?? 0).toLocaleString()}`,
        co.schedule_impact ? `${co.schedule_impact} days` : '0',
      ]);
      return { reportType, title: config.title, columns: config.columns, rows, count: rows.length, source: 'live', message: `Change Order Log — ${rows.length} records (${timestamp})` };
    }

    if (reportType === 'lien-waiver-log') {
      let q = anyDb.from('lien_waivers').select('*, subcontractors!subcontractor_id(company_name, trade), projects!project_id(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100);
      if (projectId) q = q.eq('project_id', projectId);
      const { data: waivers } = await q;
      const rows = (waivers || []).map((w: any) => [
        w.subcontractors?.company_name ?? 'Unknown',
        w.subcontractors?.trade ?? '',
        w.waiver_type ?? w.type ?? '',
        w.amount ? `$${w.amount.toLocaleString()}` : '',
        (w.status ?? '').toUpperCase(),
        w.signed_at ? 'Signed' : 'Pending',
      ]);
      return { reportType, title: config.title, columns: config.columns, rows, count: rows.length, source: 'live', message: `Lien Waiver Log — ${rows.length} records (${timestamp})` };
    }

    if (reportType === 'insurance-compliance') {
      let q = anyDb.from('insurance_certificates').select('*, subcontractors!sub_id(company_name, trade), projects!project_id(name)').eq('tenant_id', tenantId).order('expiry_date', { ascending: true }).limit(100);
      if (projectId) q = q.eq('project_id', projectId);
      const { data: certs } = await q;
      const in30 = addDays(today, 30);
      const rows = (certs || []).map((c: any) => {
        const expiring = c.expiry_date && c.expiry_date < in30;
        const expired = c.expiry_date && c.expiry_date < today;
        return [
          c.subcontractors?.company_name ?? 'Unknown',
          c.subcontractors?.trade ?? '',
          c.policy_number ?? '',
          c.expiry_date ?? '',
          c.policy_type ?? '',
          c.expiry_date ?? '',
          expired ? 'EXPIRED' : expiring ? 'EXPIRING SOON' : 'CURRENT',
        ];
      });
      return { reportType, title: config.title, columns: config.columns, rows, count: rows.length, source: 'live', message: `Insurance Compliance — ${rows.length} records (${timestamp})` };
    }

    if (reportType === 'job-cost') {
      let q = anyDb.from('budget_lines').select('*, projects(name)').eq('tenant_id', tenantId).order('created_at', { ascending: true }).limit(100);
      if (projectId) q = q.eq('project_id', projectId);
      const { data: lines } = await q;
      const rows = (lines || []).map((l: any) => {
        const originalBudgetCents = toCents(l.original_budget ?? 0);
        const forecastCents = toCents(l.forecast_cost ?? l.original_budget ?? 0);
        const varianceCents = subCents(originalBudgetCents, forecastCents);
        return [
          l.cost_code ?? '',
          l.description ?? '',
          `$${(l.original_budget ?? 0).toLocaleString()}`,
          `$${(l.committed ?? 0).toLocaleString()}`,
          `$${(l.actual_cost ?? 0).toLocaleString()}`,
          `$${toDollars(forecastCents).toLocaleString()}`,
          `$${toDollars(varianceCents).toLocaleString()}`,
        ];
      });
      return { reportType, title: config.title, columns: config.columns, rows, count: rows.length, source: 'live', message: `Job Cost Report — ${rows.length} cost codes (${timestamp})` };
    }

    if (reportType === 'autopilot-alerts') {
      const { data: alerts } = await anyDb
        .from('notifications')
        .select('id, title, message, created_at, type')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);
      const rows = (alerts || []).map((a: any) => [
        a.title ?? '',
        a.message ?? '',
        a.type ?? '',
        '',
        '',
        a.created_at ? new Date(a.created_at).toLocaleDateString() : '',
      ]);
      return { reportType, title: config.title, columns: config.columns, rows, count: rows.length, source: 'live', message: `Autopilot Alert History — ${rows.length} alerts (${timestamp})` };
    }

    // No live query exists for this reportType — return an honest empty result.
    return { reportType, title: config.title, columns: config.columns, rows: [], count: 0, source: 'empty', message: `${config.title} — no live data source (${timestamp})` };
  } catch {
    // A query failed — report honestly as empty rather than fabricating rows.
    return { reportType, title: config.title, columns: config.columns, rows: [], count: 0, source: 'empty', message: `${config.title} — no data yet (${timestamp})` };
  }
}
