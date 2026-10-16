/**
 * lib/project-context.ts
 * Builds a COMPACT, tenant-scoped live-data context block for a single project so
 * the Saguaro Intelligence chatbot can actually answer about THIS project.
 *
 * Mirrors the aggregation in app/api/projects/[projectId]/route.ts but selects only
 * the columns the model needs and renders a tight text block (a few hundred tokens,
 * not the raw dump). Server-only — uses the service-role client, always filtered by
 * both project_id AND tenant_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { toCents, sumCents } from '@/lib/calc';
import { contractMoney } from '@/lib/job-contract';

/** cents → compact whole-dollar string, e.g. "$1,240,000". */
function usd(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/** Trim + collapse whitespace, cap length so a single field can't blow the budget. */
function clip(s: unknown, max = 90): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/**
 * Load a compact context block for `projectId`, scoped to `tenantId`.
 * Returns null when the project is missing / not in this tenant (so the caller
 * simply skips injection and never leaks another tenant's data).
 */
export async function buildProjectContext(
  db: SupabaseClient<Database>,
  tenantId: string,
  projectId: string,
): Promise<string | null> {
  try {
    const [
      { data: project },
      { data: subs },
      { data: payApps },
      { data: changeOrders },
      { data: rfis },
      { data: budgetLines },
      { data: schedulePhases },
      { data: alerts },
      { data: dailyLogs },
    ] = await Promise.all([
      db.from('projects').select('name, project_number, status, phase, percent_complete, city, state, project_type, type, original_contract_amount, original_contract_value, original_contract, revised_contract_value, contract_value, contract_amount, start_date, target_finish_date, end_date').eq('id', projectId).eq('tenant_id', tenantId).single(),
      db.from('contracts').select('contract_type, party_name, party_company, vendor_name, counterparty_name, trade, amount, contract_amount, original_amount, status').eq('project_id', projectId).eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      db.from('pay_applications').select('total_completed_stored, app_number').eq('project_id', projectId).eq('tenant_id', tenantId).order('app_number', { ascending: false }),
      db.from('change_orders').select('title, amount, cost_impact, status').eq('project_id', projectId).eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      db.from('rfis').select('subject, status, due_date').eq('project_id', projectId).eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      db.from('budget_lines').select('original_budget, committed, actual, projected').eq('project_id', projectId).eq('tenant_id', tenantId),
      db.from('schedule_phases').select('name, status, percent_complete, start_date, end_date').eq('project_id', projectId).eq('tenant_id', tenantId).order('sort_order', { ascending: true }),
      db.from('autopilot_alerts').select('alert_type, severity, body').eq('project_id', projectId).eq('tenant_id', tenantId).eq('status', 'active').order('created_at', { ascending: false }).limit(5),
      db.from('daily_logs').select('log_date, crew_count, manpower_count, activities, delays, issues, safety_notes').eq('project_id', projectId).eq('tenant_id', tenantId).order('log_date', { ascending: false }).limit(1),
    ]);

    if (!project) return null;
    const p = project as any;

    const cos = (changeOrders || []) as any[];
    const apps = (payApps || []) as any[];
    const lines = (budgetLines || []) as any[];
    const allRfis = (rfis || []) as any[];
    const subRows = (subs || []) as any[];
    const phases = (schedulePhases || []) as any[];
    const alertRows = (alerts || []) as any[];
    const log = (dailyLogs || [])[0] as any | undefined;

    // Contract: original + APPROVED COs — the one rule every screen reads
    // (lib/job-contract). The old chain read contract_value / contract_amount
    // as the original, and both already carry approved COs on some jobs.
    const prime = subRows.find((c) => String(c.contract_type || '').toLowerCase() === 'prime') ?? null;
    const money = contractMoney({ project: p, prime, changeOrders: cos });
    const contract = {
      originalContract: toCents(money.original),
      approvedChangeOrders: toCents(money.approvedChanges),
      revisedContract: toCents(money.current),
    };
    const billedCents = apps.length > 0 ? toCents(apps[0].total_completed_stored || 0) : 0;

    // Budget health — exact-cents sums.
    const budOrig = sumCents(lines.map((l) => toCents(l.original_budget || 0)));
    const committed = sumCents(lines.map((l) => toCents(l.committed || 0)));
    const actual = sumCents(lines.map((l) => toCents(l.actual || 0)));
    const forecast = sumCents(lines.map((l) => toCents(l.projected || l.original_budget || 0)));

    // Open RFIs (not answered/closed).
    const openRfis = allRfis.filter((r) => r.status !== 'answered' && r.status !== 'closed');
    const rfiTitles = openRfis.slice(0, 3).map((r) => `"${clip(r.subject, 60)}"`).join(', ');

    // Pending change orders.
    const pendingCos = cos.filter((c) => c.status === 'pending');
    const pendingCoCents = sumCents(pendingCos.map((c) => toCents(c.amount || 0)));
    const coTitles = pendingCos.slice(0, 3).map((c) => `"${clip(c.title, 50)}" ${usd(toCents(c.amount || 0))}`).join(', ');

    // Active subcontractors (exclude clearly-dead statuses).
    const activeSubs = subRows.filter((s) => !['void', 'voided', 'cancelled', 'canceled', 'rejected', 'declined'].includes(String(s.status || '').toLowerCase()));
    const subNames = activeSubs.slice(0, 4).map((s) => {
      const nm = clip(s.vendor_name || s.party_company || s.party_name || s.counterparty_name || 'Unnamed', 40);
      return s.trade ? `${nm} (${clip(s.trade, 24)})` : nm;
    }).join('; ');

    // Schedule: current = in-progress phase, else first not-yet-complete.
    const current = phases.find((ph) => String(ph.status || '').toLowerCase() === 'in_progress')
      || phases.find((ph) => (ph.percent_complete ?? 0) < 100);

    const lines_out: string[] = [];
    lines_out.push('=== LIVE PROJECT DATA (authoritative — use this to answer about THIS project; do not invent numbers) ===');
    lines_out.push(`Project: ${clip(p.name, 80)}${p.project_number ? ` (#${clip(p.project_number, 24)})` : ''} — status ${clip(p.status || 'unknown', 24)}${p.phase ? `, phase ${clip(p.phase, 24)}` : ''}${p.percent_complete != null ? `, ${p.percent_complete}% complete` : ''}`);
    if (p.city || p.state || p.project_type || p.type) {
      lines_out.push(`Location/type: ${[clip(p.city, 40), clip(p.state, 24)].filter(Boolean).join(', ') || 'n/a'}${(p.project_type || p.type) ? ` — ${clip(p.project_type || p.type, 40)}` : ''}`);
    }
    lines_out.push(`Contract: original ${usd(contract.originalContract)}, approved COs ${usd(contract.approvedChangeOrders)}, revised ${usd(contract.revisedContract)}; billed to date ${usd(billedCents)} across ${apps.length} pay app(s)`);
    lines_out.push(`Budget (${lines.length} cost codes): original ${usd(budOrig)}, committed ${usd(committed)}, actual ${usd(actual)}, forecast ${usd(forecast)}`);
    lines_out.push(`Open RFIs: ${openRfis.length}${rfiTitles ? ` — ${rfiTitles}` : ''}`);
    lines_out.push(`Pending change orders: ${pendingCos.length} totaling ${usd(pendingCoCents)}${coTitles ? ` — ${coTitles}` : ''}`);
    lines_out.push(`Subcontractors on contract: ${activeSubs.length}${subNames ? ` — ${subNames}` : ''}`);
    if (phases.length) {
      lines_out.push(`Schedule: ${phases.length} phase(s)${current ? `; current "${clip(current.name, 50)}" ${current.percent_complete ?? 0}% (${clip(current.status || 'active', 20)})` : ''}`);
    }
    if (alertRows.length) {
      const top = alertRows.slice(0, 3).map((a) => `${clip(a.severity || 'info', 12)}: ${clip(a.body || a.alert_type, 70)}`).join(' | ');
      lines_out.push(`Active alerts: ${alertRows.length} — ${top}`);
    }
    if (log) {
      const crew = log.crew_count ?? log.manpower_count;
      const bits = [
        crew != null ? `crew ${crew}` : '',
        log.activities ? `activities: ${clip(log.activities, 110)}` : '',
        log.delays ? `delays: ${clip(log.delays, 60)}` : '',
        log.issues ? `issues: ${clip(log.issues, 60)}` : '',
      ].filter(Boolean).join('; ');
      lines_out.push(`Latest daily log (${clip(log.log_date, 24)}): ${bits || 'no detail'}`);
    }
    lines_out.push('=== END LIVE PROJECT DATA ===');

    return lines_out.join('\n');
  } catch {
    // Never break the chat if context can't load — the model still answers with general expertise.
    return null;
  }
}
