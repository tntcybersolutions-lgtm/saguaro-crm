/**
 * Autopilot scan engine — the shared brain behind both the on-demand "Run Scan Now" button
 * (/api/autopilot/run) and the scheduled cron (/api/cron/autopilot) that makes the "24/7
 * monitoring" claim actually TRUE. Deterministic: queries real tenant data, produces real alerts.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { must } from '@/lib/db-write';
import { addDays, companyDay } from '@/lib/time-zone';

export interface AutopilotAlert {
  tenant_id: string;
  project_id: string | null;
  severity: 'high' | 'medium' | 'low';
  alert_type: string;
  title: string;
  body: string;
  status: 'open';
}

/**
 * Run every autopilot check for one tenant (optionally scoped to a project), replace that
 * tenant's open alerts, and return a summary. `db` is a Supabase client (service-role for cron,
 * or the RLS client for the on-demand path).
 *
 * "Overdue" and "expiring" are judged on the company's day: `opts.today` when the caller
 * already knows it (the on-demand run: the person's device zone, else the company's), else
 * the company's own zone (tenants.time_zone), else the UTC day — logged.
 */
export async function runAutopilotScan(db: any, tenantId: string, projectId?: string | null, opts: { today?: string } = {}): Promise<{ alertsCreated: number; summary: string }> {
  const today = opts.today ?? (await companyDay(db, tenantId, 'autopilot/scan')).today;
  const in30 = addDays(today, 30);
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const velocityCutoff = twoWeeksAgo;
  const scope = (q: any) => (projectId ? q.eq('project_id', projectId) : q);
  const alerts: AutopilotAlert[] = [];
  const results: string[] = [];

  // 1. Overdue RFIs
  const { data: overdueRFIs } = await scope(db.from('rfis').select('id, subject, project_id').eq('tenant_id', tenantId).in('status', ['open', 'under_review']).lt('response_due_date', today).limit(20));
  for (const rfi of overdueRFIs || []) alerts.push({ tenant_id: tenantId, project_id: rfi.project_id, severity: 'high', alert_type: 'Overdue RFI', title: 'Overdue RFI', body: `RFI "${rfi.subject || rfi.id}" is past due`, status: 'open' });
  if (overdueRFIs?.length) results.push(`${overdueRFIs.length} overdue RFI(s)`);

  // 2. Expiring insurance certificates (within 30 days)
  const { data: expiringCerts } = await scope(db.from('insurance_certificates').select('id, sub_name, expiry_date, project_id').eq('tenant_id', tenantId).eq('status', 'active').lte('expiry_date', in30).gte('expiry_date', today).limit(20));
  for (const cert of expiringCerts || []) alerts.push({ tenant_id: tenantId, project_id: cert.project_id, severity: 'medium', alert_type: 'Expiring Insurance', title: 'Expiring Insurance', body: `${cert.sub_name || 'Certificate'} expires ${cert.expiry_date}`, status: 'open' });
  if (expiringCerts?.length) results.push(`${expiringCerts.length} expiring insurance cert(s)`);

  // 3. Pending lien waivers
  const { data: pendingWaivers } = await scope(db.from('lien_waivers').select('id, project_id').eq('tenant_id', tenantId).eq('status', 'pending').is('deleted_at', null).limit(20));
  if (pendingWaivers?.length) { results.push(`${pendingWaivers.length} pending lien waiver(s)`); alerts.push({ tenant_id: tenantId, project_id: projectId || null, severity: 'medium', alert_type: 'Pending Lien Waivers', title: 'Pending Lien Waivers', body: `${pendingWaivers.length} lien waiver(s) awaiting signature`, status: 'open' }); }

  // 4. Stale change orders (pending > 14 days)
  const { data: staleCOs } = await scope(db.from('change_orders').select('id, title, project_id').eq('tenant_id', tenantId).eq('status', 'pending').lt('created_at', twoWeeksAgo).limit(20));
  for (const co of staleCOs || []) alerts.push({ tenant_id: tenantId, project_id: co.project_id, severity: 'high', alert_type: 'Stale Change Order', title: 'Stale Change Order', body: `Change order "${co.title || co.id}" pending > 14 days`, status: 'open' });
  if (staleCOs?.length) results.push(`${staleCOs.length} stale change order(s)`);

  // 5. Budget overruns — actual >= 90% of original_budget
  const { data: budgetLines } = await scope(db.from('budget_lines').select('id, cost_code, description, original_budget, actual, project_id').eq('tenant_id', tenantId).gt('original_budget', 0).limit(100));
  const overrun = (budgetLines || []).filter((l: any) => (l.actual || 0) / l.original_budget >= 0.9);
  for (const line of overrun) { const pct = Math.round((line.actual / line.original_budget) * 100); alerts.push({ tenant_id: tenantId, project_id: line.project_id, severity: pct >= 100 ? 'high' : 'medium', alert_type: pct >= 100 ? 'Budget Exceeded' : 'Budget At Risk', title: pct >= 100 ? 'Budget Exceeded' : 'Budget At Risk', body: `${line.cost_code ? line.cost_code + ' — ' : ''}${line.description || 'Budget line'} at ${pct}% spent`, status: 'open' }); }
  if (overrun.length) results.push(`${overrun.length} budget line(s) at risk`);

  // 6. Overdue invoices (past due, unpaid)
  const { data: overdueInvoices } = await scope(db.from('invoices').select('id, invoice_number, total, due_date, project_id').eq('tenant_id', tenantId).in('status', ['sent', 'overdue', 'pending', 'approved', 'Sent', 'Pending']).lt('due_date', today).limit(20));
  for (const inv of overdueInvoices || []) alerts.push({ tenant_id: tenantId, project_id: inv.project_id, severity: 'high', alert_type: 'Overdue Invoice', title: 'Overdue Invoice', body: `Invoice ${inv.invoice_number || inv.id}${inv.total ? ` ($${Number(inv.total).toLocaleString()})` : ''} is past due ${inv.due_date}`, status: 'open' });
  if (overdueInvoices?.length) results.push(`${overdueInvoices.length} overdue invoice(s)`);

  // 7. Velocity — scope-creep signals
  const { count: recentCOCount } = await scope(db.from('change_orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gt('created_at', velocityCutoff));
  const { count: recentRFICount } = await scope(db.from('rfis').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gt('created_at', velocityCutoff));
  if ((recentCOCount || 0) >= 5) { alerts.push({ tenant_id: tenantId, project_id: projectId || null, severity: 'medium', alert_type: 'High CO Velocity', title: 'High CO Velocity', body: `${recentCOCount} change orders in 14 days — possible scope creep`, status: 'open' }); results.push(`CO velocity spike (${recentCOCount})`); }
  if ((recentRFICount || 0) >= 10) { alerts.push({ tenant_id: tenantId, project_id: projectId || null, severity: 'medium', alert_type: 'High RFI Velocity', title: 'High RFI Velocity', body: `${recentRFICount} RFIs in 14 days — possible design issue`, status: 'open' }); results.push(`RFI velocity spike (${recentRFICount})`); }

  // Replace this tenant/project's open alerts with the fresh set.
  await must(scope(db.from('autopilot_alerts').delete().eq('tenant_id', tenantId).eq('status', 'open')), 'autopilot_alerts delete');
  if (alerts.length) await must(db.from('autopilot_alerts').insert(alerts), 'autopilot_alerts insert');

  return { alertsCreated: alerts.length, summary: alerts.length ? `Autopilot scan complete: ${results.join(', ')}.` : 'Autopilot scan complete. No new issues detected.' };
}
