import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
import { runReport } from '@/lib/reports/run';
import { generateReportData, isRunnableReportType } from '@/lib/reports/generate';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/* eslint-disable @typescript-eslint/no-explicit-any */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/**
 * GET /api/cron/report-schedules
 *
 * Makes "scheduled report delivery" TRUE. Scheduled reports are saved on
 * report_templates.template_data.schedule = { enabled, frequency, recipients, nextRun }
 * by /api/reports/[id]/schedule — but nothing ran them. This cron:
 *   1. Finds every enabled schedule that is due (nextRun <= now, or never run).
 *   2. Runs the report against LIVE tenant data:
 *        - entity-based definitions (template_data.entity) via lib/reports/run,
 *        - canned report_type definitions via lib/reports/generate,
 *      reusing the exact same engines as the interactive /api/reports/* routes.
 *   3. Emails a formatted HTML summary + CSV attachment to the recipients via
 *      lib/email (which honestly skips when RESEND_API_KEY is unset).
 *   4. Advances nextRun by the schedule's frequency and records lastRunAt/status.
 *
 * Guarded by CRON_SECRET in production. Wired in vercel.json crons.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServerClient();
  const now = new Date();
  const resendConfigured = !!process.env.RESEND_API_KEY;

  let templatesScanned = 0;
  let due = 0;
  let delivered = 0;
  let skippedNoRecipients = 0;
  let skippedNotRunnable = 0;
  let emailSkippedNoResend = 0;
  const errors: string[] = [];

  try {
    // report_templates is in the generated types; template_data is jsonb. We fetch
    // the small set of templates and filter for an enabled schedule in memory
    // (there is no jsonb index worth pushing this filter down to).
    const { data: templates, error } = await db
      .from('report_templates')
      .select('id, tenant_id, name, report_type, template_data');
    if (error) throw error;

    for (const t of (templates || []) as any[]) {
      templatesScanned++;
      const td = (t.template_data && typeof t.template_data === 'object') ? t.template_data as Record<string, any> : {};
      const schedule = (td.schedule && typeof td.schedule === 'object') ? td.schedule as Record<string, any> : null;
      if (!schedule || schedule.enabled !== true) continue;

      // Due check: nextRun in the past/now, or never scheduled a first run.
      const nextRunStr = typeof schedule.nextRun === 'string' ? schedule.nextRun : null;
      const nextRunDate = nextRunStr ? new Date(nextRunStr) : null;
      const isDue = !nextRunDate || isNaN(nextRunDate.getTime()) || nextRunDate.getTime() <= now.getTime();
      if (!isDue) continue;
      due++;

      const frequency = String(schedule.frequency || 'weekly');
      const recipients: string[] = Array.isArray(schedule.recipients)
        ? schedule.recipients.filter((r: unknown): r is string => typeof r === 'string' && r.includes('@'))
        : [];

      let status = 'delivered';
      let rowCount = 0;

      try {
        // ── Resolve + run the report against live tenant data ──
        const rendered = await runScheduledReport(db, t.tenant_id, t, td);
        if (!rendered) {
          status = 'skipped: no runnable report definition';
          skippedNotRunnable++;
        } else {
          rowCount = rendered.rowCount;
          if (recipients.length === 0) {
            status = 'skipped: no recipients';
            skippedNoRecipients++;
          } else if (!resendConfigured) {
            // Honest: we ran the report but cannot deliver email without RESEND.
            status = 'ran, email skipped: RESEND_API_KEY not configured';
            emailSkippedNoResend++;
          } else {
            const subject = `${rendered.title} — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            const csv = toCsv(rendered.columns, rendered.rows);
            const res = await sendEmail({
              to: recipients,
              subject,
              html: buildReportEmail(rendered.title, rendered.columns, rendered.rows, t.name),
              attachments: [{ filename: `${safeName(rendered.title)}-${now.toISOString().slice(0, 10)}.csv`, content: Buffer.from(csv, 'utf8') }],
            });
            if (res) {
              delivered++;
              status = `delivered to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}`;
            } else {
              status = 'email send returned no id';
              emailSkippedNoResend++;
            }
          }
        }
      } catch (e) {
        status = `error: ${e instanceof Error ? e.message : 'run failed'}`;
        errors.push(`${t.id}: ${status}`);
      }

      // ── Advance nextRun + record run bookkeeping (always, so it never tight-loops) ──
      const nextRun = computeNextRun(frequency, now);
      const newSchedule = {
        ...schedule,
        nextRun,
        lastRunAt: now.toISOString(),
        lastStatus: status,
        lastRowCount: rowCount,
      };
      const merged = { ...td, schedule: newSchedule };
      const { error: upErr } = await db
        .from('report_templates')
        .update({ template_data: merged })
        .eq('id', t.id)
        .eq('tenant_id', t.tenant_id);
      if (upErr) errors.push(`${t.id}: persist nextRun failed: ${upErr.message}`);
    }

    return NextResponse.json({
      success: true,
      resendConfigured,
      templatesScanned,
      due,
      delivered,
      skippedNoRecipients,
      skippedNotRunnable,
      emailSkippedNoResend,
      errors,
    });
  } catch (e) {
    console.error('[cron/report-schedules]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface RenderedReport {
  title: string;
  columns: string[];
  rows: string[][];
  rowCount: number;
}

/**
 * Resolve a report_template to a runnable definition and execute it against live
 * tenant data. Returns null when there is no real query for the definition
 * (honest skip — we never fabricate rows).
 */
async function runScheduledReport(
  db: ReturnType<typeof createServerClient>,
  tenantId: string,
  template: any,
  td: Record<string, any>,
): Promise<RenderedReport | null> {
  // 1) Entity-based definition → reuse lib/reports/run (same as POST /api/reports/run).
  const entity = typeof td.entity === 'string' ? td.entity : (typeof td.config?.entity === 'string' ? td.config.entity : null);
  if (entity) {
    const cfg = (td.config && typeof td.config === 'object') ? td.config : td;
    const result = await runReport(db as any, tenantId, {
      entity,
      columns: cfg.columns,
      filters: cfg.filters,
      groupBy: cfg.groupBy,
      sort: cfg.sort,
      limit: cfg.limit,
    });
    const columns = result.columns.map((c) => c.label);
    const rows = result.rows.map((r) => result.columns.map((c) => formatCell(r[c.key])));
    return { title: template.name || result.entity, columns, rows, rowCount: result.rowCount };
  }

  // 2) Canned report_type definition → reuse lib/reports/generate (same as /api/reports/generate).
  const reportType = String(
    td.reportType || td.preset || template.report_type || '',
  ).trim();
  if (reportType && isRunnableReportType(reportType)) {
    const projectId = typeof td.projectId === 'string' ? td.projectId : null;
    const gen = await generateReportData(db as any, tenantId, reportType, projectId);
    return { title: template.name || gen.title, columns: gen.columns, rows: gen.rows, rowCount: gen.count };
  }

  // No runnable definition — do not fabricate.
  return null;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function safeName(s: string): string {
  return String(s || 'report').replace(/[^\w.-]+/g, '_').slice(0, 60);
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(columns: string[], rows: string[][]): string {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  return body ? `${header}\n${body}` : header;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReportEmail(title: string, columns: string[], rows: string[][], templateName: string): string {
  const MAX_PREVIEW = 100;
  const preview = rows.slice(0, MAX_PREVIEW);
  const th = columns.map((c) => `<th style="text-align:left;padding:8px 10px;font-size:12px;color:#6b7280;border-bottom:2px solid #e5e7eb;white-space:nowrap;">${esc(c)}</th>`).join('');
  const trs = preview.map((r, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
    const tds = r.map((cell) => `<td style="padding:8px 10px;font-size:13px;color:#111827;border-bottom:1px solid #f0f0f0;">${esc(cell)}</td>`).join('');
    return `<tr style="background:${bg};">${tds}</tr>`;
  }).join('');
  const emptyNote = rows.length === 0
    ? `<p style="margin:16px 0;color:#6b7280;font-size:14px;">No records matched this report at the time it ran.</p>`
    : '';
  const truncNote = rows.length > MAX_PREVIEW
    ? `<p style="margin:12px 0 0;color:#9ca3af;font-size:12px;">Showing the first ${MAX_PREVIEW} of ${rows.length} rows — the attached CSV contains the full dataset.</p>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
<tr><td align="center">
<table width="720" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:720px;width:100%;">
<tr><td style="background:#0D1116;padding:22px 32px;">
  <span style="color:#FFE600;font-size:22px;font-weight:700;letter-spacing:1px;">SAGUARO</span>
  <span style="color:#fff;font-size:13px;margin-left:8px;opacity:0.65;">Scheduled Report</span>
</td></tr>
<tr><td style="padding:28px 32px;">
  <h2 style="margin:0 0 6px;color:#0D1116;font-size:20px;">${esc(title)}</h2>
  <p style="margin:0 0 18px;color:#6b7280;font-size:13px;">${esc(templateName || '')} &middot; ${rows.length} row${rows.length !== 1 ? 's' : ''} &middot; generated ${new Date().toLocaleString('en-US')}</p>
  ${emptyNote}
  <div style="overflow-x:auto;">
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;">
      <thead><tr>${th}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>
  ${truncNote}
  <p style="margin:22px 0 0;font-size:12px;color:#9ca3af;">The complete dataset is attached as a CSV. Manage this schedule in <a href="${APP_URL}/app/reports/builder#schedules" style="color:#9ca3af;">Reports</a>.</p>
</td></tr>
<tr><td style="background:#f4f4f5;padding:16px 32px;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">&copy; ${new Date().getFullYear()} Saguaro Control Systems &mdash; automated scheduled report.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/** Advance from `from` to the next occurrence for the given frequency. */
function computeNextRun(frequency: string, from: Date): string {
  const d = new Date(from.getTime());
  switch (String(frequency).toLowerCase()) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'weekly':
    default:
      d.setDate(d.getDate() + 7);
      break;
  }
  return d.toISOString();
}
