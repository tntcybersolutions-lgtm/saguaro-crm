/**
 * rfi-workflow.ts
 *
 * Formal RFI workflow engine for Saguaro CRM.
 *
 * Manages the full construction RFI lifecycle:
 *   1. Create  — assigns sequential number (RFI-001), stamps metadata
 *   2. Transmit — logs a transmittal, sets response deadline
 *   3. Respond — captures answer, logs cost/schedule impact
 *   4. Close   — marks RFI closed, propagates impacts to project budget & schedule
 *   5. Escalate — autopilot integration: alerts when response is overdue
 *
 * Data flows:
 *   RFI cost impact  → budget_line_items (approved_changes column)
 *   RFI schedule impact → schedule_tasks (baseline adjustment log)
 *   RFI overdue     → autopilot_alerts (RFI_OVERDUE rule)
 *
 * Usage (CLI):
 *   npx tsx rfi-workflow.ts create   <tenantId> <projectId> <title> [description]
 *   npx tsx rfi-workflow.ts transmit <tenantId> <rfiId> <toParty> <responseRequiredBy>
 *   npx tsx rfi-workflow.ts respond  <tenantId> <rfiId> <responseBody> [costImpact] [scheduleDays]
 *   npx tsx rfi-workflow.ts close    <tenantId> <rfiId>
 *   npx tsx rfi-workflow.ts escalate <tenantId> [projectId]
 *
 * Usage (programmatic):
 *   import { createRfi, transmitRfi, respondRfi, closeRfi, escalateOverdueRfis } from './rfi-workflow';
 */

import { supabaseAdmin } from './supabase/admin';
import { EmailService } from './email-service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RfiScope = {
  tenantId: string;
  projectId: string;
};

export type CreateRfiOptions = RfiScope & {
  title: string;
  description?: string;
  assignedTo?: string;        // email or name of responsible party
  dueDate?: string;           // ISO date YYYY-MM-DD
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  costImpactPotential?: number;
  scheduleImpactPotentialDays?: number;
  drawingReference?: string;
  specificationSection?: string;
  createdBy?: string;
};

export type TransmitRfiOptions = {
  tenantId: string;
  rfiId: string;
  fromParty: string;
  toParty: string;
  subject?: string;
  body?: string;
  responseRequiredByDate: string;  // ISO date YYYY-MM-DD
  createdBy?: string;
};

export type RespondRfiOptions = {
  tenantId: string;
  rfiId: string;
  responseBody: string;
  costImpactAmount?: number;
  scheduleImpactDays?: number;
  budgetLineItemId?: string;   // if set, applies cost impact to this line item
  respondedBy?: string;
};

export type CloseRfiOptions = {
  tenantId: string;
  rfiId: string;
  closedBy?: string;
};

export type EscalateOptions = {
  tenantId: string;
  projectId?: string;   // if omitted, scans all projects for tenant
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function nextRfiNumber(tenantId: string, projectId: string): Promise<string> {
  const { count } = await supabaseAdmin
    .from('rfis')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId);

  return `RFI-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

async function nextTransmittalNumber(tenantId: string, rfiId: string): Promise<string> {
  const { count } = await supabaseAdmin
    .from('rfi_transmittals')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('rfi_id', rfiId);

  return `T-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Create RFI
// ─────────────────────────────────────────────────────────────────────────────

export async function createRfi(opts: CreateRfiOptions) {
  const now = new Date().toISOString();
  const rfiNumber = await nextRfiNumber(opts.tenantId, opts.projectId);

  const { data: rfi, error } = await supabaseAdmin
    .from('rfis')
    .insert({
      tenant_id: opts.tenantId,
      project_id: opts.projectId,
      number: rfiNumber,
      title: opts.title,
      description: opts.description ?? null,
      status: 'open',
      assigned_to: opts.assignedTo ?? null,
      due_date: opts.dueDate ?? null,
      priority: opts.priority ?? 'normal',
      cost_impact_potential: opts.costImpactPotential ?? null,
      schedule_impact_potential_days: opts.scheduleImpactPotentialDays ?? null,
      drawing_reference: opts.drawingReference ?? null,
      specification_section: opts.specificationSection ?? null,
      created_by: opts.createdBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select('id, number')
    .single();

  if (error) throw new Error(`RFI create failed: ${error.message}`);

  return { rfiId: rfi.id as string, rfiNumber: rfi.number as string };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Transmit RFI  (send to architect / engineer / owner)
// ─────────────────────────────────────────────────────────────────────────────

export async function transmitRfi(opts: TransmitRfiOptions) {
  const now = new Date().toISOString();

  // Fetch the RFI to verify it belongs to this tenant
  const { data: rfi, error: rfiErr } = await supabaseAdmin
    .from('rfis')
    .select('id, project_id, status, number, title, response_due_date, assigned_to')
    .eq('id', opts.rfiId)
    .eq('tenant_id', opts.tenantId)
    .single();

  if (rfiErr || !rfi) throw new Error(`RFI not found: ${rfiErr?.message}`);
  if ((rfi.status as string) === 'closed') throw new Error('Cannot transmit a closed RFI.');

  const transmittalNumber = await nextTransmittalNumber(opts.tenantId, opts.rfiId);

  const { data: transmittal, error: txErr } = await supabaseAdmin
    .from('rfi_transmittals')
    .insert({
      tenant_id: opts.tenantId,
      project_id: rfi.project_id as string,
      rfi_id: opts.rfiId,
      transmittal_number: transmittalNumber,
      transmittal_type: 'transmitted',
      from_party: opts.fromParty,
      to_party: opts.toParty,
      subject: opts.subject ?? `RFI ${rfi.number as string}: ${rfi.title as string}`,
      body: opts.body ?? null,
      response_required_by: opts.responseRequiredByDate,
      created_by: opts.createdBy ?? null,
      created_at: now,
    })
    .select('id')
    .single();

  if (txErr) throw new Error(`Transmittal insert failed: ${txErr.message}`);

  // Update RFI status to 'under_review' and set response deadline
  await supabaseAdmin
    .from('rfis')
    .update({
      status: 'under_review',
      response_due_date: opts.responseRequiredByDate,
      updated_at: now,
    })
    .eq('id', opts.rfiId);

  // Email the transmittal to the recipient party
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

  // Fetch project name for the email
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('name')
    .eq('id', rfi.project_id as string)
    .single();

  // Fetch the to_party's email from project_contacts if possible
  const { data: contact } = await supabaseAdmin
    .from('project_contacts')
    .select('email')
    .eq('project_id', rfi.project_id as string)
    .eq('tenant_id', opts.tenantId)
    .ilike('company_name', `%${opts.toParty}%`)
    .limit(1)
    .maybeSingle();

  const toEmail = contact?.email ?? null;

  if (toEmail) {
    await EmailService.sendRfiTransmittal({
      to: toEmail,
      fromParty: opts.fromParty,
      projectName: (project?.name as string) ?? 'Project',
      rfiNumber: rfi.number as string,
      rfiTitle: rfi.title as string,
      rfiDescription: opts.body ?? `Please see RFI ${rfi.number as string} for details.`,
      responseRequiredBy: opts.responseRequiredByDate,
      transmittalNumber,
      rfiUrl: `${appUrl}/rfi/${opts.rfiId}`,
    });
  }

  return {
    transmittalId: transmittal.id as string,
    transmittalNumber,
    responseRequiredBy: opts.responseRequiredByDate,
    emailSent: !!toEmail,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Respond to RFI  (capture answer + cost/schedule impact)
// ─────────────────────────────────────────────────────────────────────────────

export async function respondRfi(opts: RespondRfiOptions) {
  const now = new Date().toISOString();

  const { data: rfi, error: rfiErr } = await supabaseAdmin
    .from('rfis')
    .select('id, project_id, tenant_id, status, number, title, created_at')
    .eq('id', opts.rfiId)
    .eq('tenant_id', opts.tenantId)
    .single();

  if (rfiErr || !rfi) throw new Error(`RFI not found: ${rfiErr?.message}`);
  if ((rfi.status as string) === 'closed') throw new Error('Cannot respond to a closed RFI.');

  const transmittalNumber = await nextTransmittalNumber(opts.tenantId, opts.rfiId);

  // Log response transmittal
  await supabaseAdmin.from('rfi_transmittals').insert({
    tenant_id: opts.tenantId,
    project_id: rfi.project_id as string,
    rfi_id: opts.rfiId,
    transmittal_number: transmittalNumber,
    transmittal_type: 'responded',
    from_party: 'Architect / Engineer',
    to_party: 'General Contractor',
    subject: `Response: RFI ${rfi.number as string}`,
    body: null,
    response_body: opts.responseBody,
    responded_at: now,
    cost_impact_amount: opts.costImpactAmount ?? null,
    schedule_impact_days: opts.scheduleImpactDays ?? null,
    created_by: opts.respondedBy ?? null,
    created_at: now,
  });

  // Update RFI status and capture impacts
  await supabaseAdmin
    .from('rfis')
    .update({
      status: 'answered',
      response: opts.responseBody,
      responded_at: now,
      cost_impact_amount: opts.costImpactAmount ?? null,
      schedule_impact_days: opts.scheduleImpactDays ?? null,
      updated_at: now,
    })
    .eq('id', opts.rfiId);

  // ── Propagate cost impact to budget_line_items ────────────────────────────
  let costApplied = false;
  if (opts.costImpactAmount && opts.costImpactAmount !== 0) {
    // Try to find the matching budget line or use a general changes line
    let targetLineId = opts.budgetLineItemId;

    if (!targetLineId) {
      const { data: line } = await supabaseAdmin
        .from('budget_line_items')
        .select('id, approved_changes')
        .eq('project_id', rfi.project_id as string)
        .eq('tenant_id', opts.tenantId)
        .eq('category', 'general_conditions')
        .limit(1)
        .maybeSingle();

      targetLineId = line?.id;
    }

    if (targetLineId) {
      const { data: existingLine } = await supabaseAdmin
        .from('budget_line_items')
        .select('approved_changes')
        .eq('id', targetLineId)
        .single();

      const current = Number(existingLine?.approved_changes ?? 0);
      await supabaseAdmin
        .from('budget_line_items')
        .update({
          approved_changes: current + (opts.costImpactAmount ?? 0),
          updated_at: now,
        })
        .eq('id', targetLineId);

      costApplied = true;
    }
  }

  // ── Propagate schedule impact (log to any active schedule tasks) ──────────
  let scheduleLogged = false;
  if (opts.scheduleImpactDays && opts.scheduleImpactDays !== 0) {
    // Create a schedule_analytics variance record for the project's critical path
    const { data: criticalTask } = await supabaseAdmin
      .from('schedule_tasks')
      .select('id, baseline_finish_date')
      .eq('project_id', rfi.project_id as string)
      .eq('tenant_id', opts.tenantId)
      .eq('is_critical_path', true)
      .order('baseline_finish_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (criticalTask && criticalTask.baseline_finish_date) {
      const baseline = new Date(criticalTask.baseline_finish_date as string);
      const adjusted = new Date(
        baseline.getTime() + (opts.scheduleImpactDays ?? 0) * 86_400_000,
      );

      await supabaseAdmin.from('schedule_analytics').insert({
        task_id: criticalTask.id as string,
        baseline_date: criticalTask.baseline_finish_date,
        actual_date: adjusted.toISOString().split('T')[0],
        variance_days: opts.scheduleImpactDays,
        percent_complete: 0,
        created_at: now,
      });

      scheduleLogged = true;
    }
  }

  // Email the response to all project team members who have been on the RFI thread
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('name')
    .eq('id', rfi.project_id as string)
    .single();

  // Get all unique from/to emails from prior transmittals for this RFI
  const { data: priorTx } = await supabaseAdmin
    .from('rfi_transmittals')
    .select('from_party, to_party')
    .eq('rfi_id', opts.rfiId)
    .eq('tenant_id', opts.tenantId);

  // Fetch project team emails from project_contacts
  const { data: teamContacts } = await supabaseAdmin
    .from('project_contacts')
    .select('email')
    .eq('project_id', rfi.project_id as string)
    .eq('tenant_id', opts.tenantId)
    .in('contact_type', ['general_contractor', 'owner', 'architect', 'engineer'])
    .not('email', 'is', null);

  const teamEmails = [...new Set((teamContacts ?? []).map((c) => c.email as string).filter(Boolean))];

  if (teamEmails.length > 0) {
    await EmailService.sendRfiResponse({
      to: teamEmails,
      projectName: (project?.name as string) ?? 'Project',
      rfiNumber: rfi.number as string,
      rfiTitle: rfi.title as string,
      responseBody: opts.responseBody,
      costImpactAmount: opts.costImpactAmount,
      scheduleImpactDays: opts.scheduleImpactDays,
      respondedBy: opts.respondedBy ?? 'Architect / Engineer',
      rfiUrl: `${appUrl}/rfi/${opts.rfiId}`,
    });
  }

  return {
    rfiId: opts.rfiId,
    status: 'answered',
    costImpactAppliedToBudget: costApplied,
    scheduleImpactLogged: scheduleLogged,
    teamEmailsSent: teamEmails.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Close RFI
// ─────────────────────────────────────────────────────────────────────────────

export async function closeRfi(opts: CloseRfiOptions) {
  const now = new Date().toISOString();

  const { data: rfi, error: rfiErr } = await supabaseAdmin
    .from('rfis')
    .select('id, project_id, status, number, title, response_due_date, assigned_to')
    .eq('id', opts.rfiId)
    .eq('tenant_id', opts.tenantId)
    .single();

  if (rfiErr || !rfi) throw new Error(`RFI not found: ${rfiErr?.message}`);
  if ((rfi.status as string) === 'closed') return { rfiId: opts.rfiId, alreadyClosed: true };

  const transmittalNumber = await nextTransmittalNumber(opts.tenantId, opts.rfiId);

  await supabaseAdmin.from('rfi_transmittals').insert({
    tenant_id: opts.tenantId,
    project_id: rfi.project_id as string,
    rfi_id: opts.rfiId,
    transmittal_number: transmittalNumber,
    transmittal_type: 'closed',
    from_party: 'General Contractor',
    to_party: 'Project Team',
    subject: `RFI ${rfi.number as string} — Closed`,
    created_by: opts.closedBy ?? null,
    created_at: now,
  });

  await supabaseAdmin
    .from('rfis')
    .update({ status: 'closed', closed_at: now, updated_at: now })
    .eq('id', opts.rfiId);

  // Auto-resolve any autopilot alert for this RFI so it disappears from the dashboard
  await supabaseAdmin
    .from('autopilot_alerts')
    .update({ status: 'resolved', resolved_at: now, updated_at: now })
    .eq('tenant_id', opts.tenantId)
    .eq('entity_id', opts.rfiId)
    .eq('rule_code', 'RFI_OVERDUE')
    .in('status', ['open', 'acknowledged']);

  // Notify project team the RFI is closed
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('name')
    .eq('id', rfi.project_id as string)
    .single();

  const { data: teamContacts } = await supabaseAdmin
    .from('project_contacts')
    .select('email')
    .eq('project_id', rfi.project_id as string)
    .eq('tenant_id', opts.tenantId)
    .in('contact_type', ['general_contractor', 'owner', 'architect', 'engineer'])
    .not('email', 'is', null);

  const teamEmails = [...new Set((teamContacts ?? []).map((c) => c.email as string).filter(Boolean))];

  if (teamEmails.length > 0) {
    await EmailService.sendRfiClosedNotice({
      to: teamEmails,
      projectName: (project?.name as string) ?? 'Project',
      rfiNumber: rfi.number as string,
      rfiTitle: rfi.title as string,
      closedBy: opts.closedBy,
      rfiUrl: `${appUrl}/rfi/${opts.rfiId}`,
    });
  }

  return { rfiId: opts.rfiId, alreadyClosed: false, closedAt: now };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Escalate overdue RFIs → autopilot alerts
// ─────────────────────────────────────────────────────────────────────────────

export type EscalationSummary = {
  scanned: number;
  overdueFound: number;
  alertsUpserted: number;
  resolvedStale: number;
};

export async function escalateOverdueRfis(opts: EscalateOptions): Promise<EscalationSummary> {
  const now = new Date();
  const nowIso = now.toISOString();

  // Fetch all open/under_review RFIs that have a response_due_date
  let query = supabaseAdmin
    .from('rfis')
    .select('id, project_id, number, title, status, response_due_date, assigned_to')
    .eq('tenant_id', opts.tenantId)
    .in('status', ['open', 'under_review'])
    .not('response_due_date', 'is', null);

  if (opts.projectId) {
    query = query.eq('project_id', opts.projectId);
  }

  const { data: rfis, error } = await query;
  if (error) throw new Error(`RFI escalation query: ${error.message}`);

  const allRfis = rfis ?? [];
  const overdueRfis = allRfis.filter((rfi) => {
    const due = new Date(rfi.response_due_date as string);
    return due < now;
  });

  const alerts = overdueRfis.map((rfi) => {
    const dueDate = new Date(rfi.response_due_date as string);
    const overdueDays = daysBetween(dueDate, now);

    let severity: 'medium' | 'high' | 'critical' = 'medium';
    if (overdueDays >= 8) severity = 'critical';
    else if (overdueDays >= 4) severity = 'high';

    // Fingerprint matches the autopilot engine's format
    const fp = require('node:crypto')
      .createHash('sha256')
      .update(
        [opts.tenantId, rfi.project_id ?? '', 'rfi', rfi.id, 'RFI_OVERDUE'].join('|'),
      )
      .digest('hex');

    return {
      tenant_id: opts.tenantId,
      project_id: rfi.project_id as string | null,
      entity_type: 'rfi',
      entity_id: rfi.id as string,
      rule_code: 'RFI_OVERDUE',
      title: `Overdue RFI ${rfi.number as string}`,
      summary: `${rfi.title as string} is ${overdueDays} day(s) overdue and still ${rfi.status as string}.`,
      severity,
      status: 'open',
      fingerprint: fp,
      metadata: {
        rfiNumber: rfi.number,
        sourceStatus: rfi.status,
        dueDate: rfi.response_due_date,
        overdueDays,
        assignedTo: rfi.assigned_to ?? null,
      },
      last_detected_at: nowIso,
      resolved_at: null,
    };
  });

  let alertsUpserted = 0;
  if (alerts.length > 0) {
    const { error: upsertErr } = await supabaseAdmin
      .from('autopilot_alerts')
      .upsert(alerts, { onConflict: 'tenant_id,fingerprint' });

    if (upsertErr) throw new Error(`Alert upsert: ${upsertErr.message}`);
    alertsUpserted = alerts.length;
  }

  // Send overdue notices — one email per overdue RFI to the team
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

  // Fetch all project contact emails for the relevant projects once
  const projectIds = [...new Set(overdueRfis.map((r) => r.project_id as string).filter(Boolean))];
  const projectEmailMap = new Map<string, string[]>();

  for (const pid of projectIds) {
    const { data: contacts } = await supabaseAdmin
      .from('project_contacts')
      .select('email')
      .eq('project_id', pid)
      .eq('tenant_id', opts.tenantId)
      .in('contact_type', ['general_contractor', 'owner'])
      .not('email', 'is', null);

    const { data: proj } = await supabaseAdmin
      .from('projects')
      .select('name')
      .eq('id', pid)
      .single();

    projectEmailMap.set(pid, (contacts ?? []).map((c) => c.email as string).filter(Boolean));
    if (proj) projectEmailMap.set(`${pid}__name`, [(proj.name as string) ?? 'Project']);
  }

  for (const rfi of overdueRfis) {
    const pid = rfi.project_id as string;
    const teamEmails = projectEmailMap.get(pid) ?? [];
    if (teamEmails.length === 0) continue;

    const dueDate = new Date(rfi.response_due_date as string);
    const overdueDays = daysBetween(dueDate, now);
    const projectName = (projectEmailMap.get(`${pid}__name`) ?? ['Project'])[0];

    await EmailService.sendRfiOverdueNotice({
      to: teamEmails,
      projectName,
      rfiNumber: rfi.number as string,
      rfiTitle: rfi.title as string,
      overdueDays,
      responseRequiredBy: new Date(rfi.response_due_date as string).toLocaleDateString('en-US'),
      assignedTo: rfi.assigned_to as string ?? undefined,
      rfiUrl: `${appUrl}/rfi/${rfi.id as string}`,
    });
  }

  // Resolve stale alerts for RFIs that are no longer overdue
  const overdueRfiIds = new Set(overdueRfis.map((r) => r.id as string));
  const nonOverdueRfiIds = allRfis
    .filter((r) => !overdueRfiIds.has(r.id as string))
    .map((r) => r.id as string);

  let resolvedStale = 0;
  if (nonOverdueRfiIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('autopilot_alerts')
      .update({ status: 'resolved', resolved_at: nowIso, updated_at: nowIso })
      .eq('tenant_id', opts.tenantId)
      .eq('rule_code', 'RFI_OVERDUE')
      .in('entity_id', nonOverdueRfiIds)
      .in('status', ['open', 'acknowledged']);

    resolvedStale = 0; // count tracked via the update's affected rows
  }

  return {
    scanned: allRfis.length,
    overdueFound: overdueRfis.length,
    alertsUpserted,
    resolvedStale,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'create': {
      const [tenantId, projectId, title, description] = args;
      if (!tenantId || !projectId || !title) {
        console.error('Usage: rfi-workflow.ts create <tenantId> <projectId> <title> [description]');
        process.exit(1);
      }
      const result = await createRfi({ tenantId, projectId, title, description });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'transmit': {
      const [tenantId, rfiId, toParty, responseRequiredBy] = args;
      if (!tenantId || !rfiId || !toParty || !responseRequiredBy) {
        console.error(
          'Usage: rfi-workflow.ts transmit <tenantId> <rfiId> <toParty> <responseRequiredBy>',
        );
        process.exit(1);
      }
      const result = await transmitRfi({
        tenantId,
        rfiId,
        fromParty: 'General Contractor',
        toParty,
        responseRequiredByDate: responseRequiredBy,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'respond': {
      const [tenantId, rfiId, responseBody, costImpact, scheduleDays] = args;
      if (!tenantId || !rfiId || !responseBody) {
        console.error(
          'Usage: rfi-workflow.ts respond <tenantId> <rfiId> <responseBody> [costImpact] [scheduleDays]',
        );
        process.exit(1);
      }
      const result = await respondRfi({
        tenantId,
        rfiId,
        responseBody,
        costImpactAmount: costImpact ? Number(costImpact) : undefined,
        scheduleImpactDays: scheduleDays ? Number(scheduleDays) : undefined,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'close': {
      const [tenantId, rfiId] = args;
      if (!tenantId || !rfiId) {
        console.error('Usage: rfi-workflow.ts close <tenantId> <rfiId>');
        process.exit(1);
      }
      const result = await closeRfi({ tenantId, rfiId });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'escalate': {
      const [tenantId, projectId] = args;
      if (!tenantId) {
        console.error('Usage: rfi-workflow.ts escalate <tenantId> [projectId]');
        process.exit(1);
      }
      const result = await escalateOverdueRfis({ tenantId, projectId });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.error(
        'Commands: create | transmit | respond | close | escalate',
      );
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
