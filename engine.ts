import { createHash } from 'node:crypto';

import { supabaseAdmin } from './supabase/admin';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';
export type RuleCode =
  | 'RFI_OVERDUE'
  | 'INVOICE_OVERDUE'
  | 'SCHEDULE_SLIPPAGE'
  | 'FIELD_ISSUE_UNRESOLVED'
  | 'PROJECT_RISK_ROLLUP';
export type EntityType = 'rfi' | 'invoice' | 'schedule_task' | 'field_issue' | 'project';

export type AutopilotScope = {
  tenantId: string;
  projectId?: string | null;
};

type CandidateAlert = {
  tenant_id: string;
  project_id: string | null;
  entity_type: EntityType;
  entity_id: string | null;
  rule_code: RuleCode;
  title: string;
  summary: string;
  severity: Severity;
  status: AlertStatus;
  fingerprint: string;
  metadata: Record<string, unknown>;
  last_detected_at: string;
  resolved_at: string | null;
};

type RuleConfig = {
  RFI_OVERDUE: {
    enabled: boolean;
    medium_after_days: number;
    high_after_days: number;
    critical_after_days: number;
  };
  INVOICE_OVERDUE: {
    enabled: boolean;
    medium_after_days: number;
    high_after_days: number;
    critical_after_days: number;
    high_balance: number;
    critical_balance: number;
  };
  SCHEDULE_SLIPPAGE: {
    enabled: boolean;
    medium_after_days: number;
    high_after_days: number;
    critical_after_days: number;
  };
  FIELD_ISSUE_UNRESOLVED: {
    enabled: boolean;
    medium_after_days: number;
    high_after_days: number;
    critical_after_days: number;
  };
  PROJECT_RISK_ROLLUP: {
    enabled: boolean;
    high_open_alerts: number;
    critical_open_alerts: number;
    force_critical_if_any_critical: boolean;
  };
};

const HANDLED_RULES: RuleCode[] = [
  'RFI_OVERDUE',
  'INVOICE_OVERDUE',
  'SCHEDULE_SLIPPAGE',
  'FIELD_ISSUE_UNRESOLVED',
  'PROJECT_RISK_ROLLUP',
];

const DEFAULTS: RuleConfig = {
  // RFI SLA: AIA A201 standard is 10 days; we escalate earlier to prevent slippage.
  // Industry reality: 1 day = informational, 4 days = follow up, 7 days = schedule risk.
  RFI_OVERDUE: {
    enabled: true,
    medium_after_days: 3,   // 3 days: send friendly follow-up
    high_after_days: 7,     // 7 days: matches most contract SLAs — urgent
    critical_after_days: 14, // 14 days: likely blocking work, critical path impact
  },
  // Invoice SLA: Net 30 is standard. Escalate at 7/14/30 days past due.
  INVOICE_OVERDUE: {
    enabled: true,
    medium_after_days: 7,   // 7 days past due: send reminder
    high_after_days: 14,    // 14 days: send demand letter, consider lien
    critical_after_days: 30, // 30 days: lien rights, legal action
    high_balance: 25000,    // Any invoice >$25K is high priority regardless of days
    critical_balance: 100000, // >$100K unpaid is always critical
  },
  // Schedule: Only flag tasks that are ON the critical path or consuming float.
  // Non-critical tasks with float don't need alerts until float is consumed.
  SCHEDULE_SLIPPAGE: {
    enabled: true,
    medium_after_days: 3,   // 3 days slippage on critical path: monitor
    high_after_days: 7,     // 1 week: real project impact, re-plan required
    critical_after_days: 14, // 2 weeks: milestone at risk, owner notification
  },
  // Field issues: Severity drives escalation more than time.
  // Critical/high severity issues escalate faster.
  FIELD_ISSUE_UNRESOLVED: {
    enabled: true,
    medium_after_days: 5,   // 5 days: reasonable time to resolve minor issue
    high_after_days: 10,    // 10 days: approaching inspection risk
    critical_after_days: 21, // 3 weeks: blocking work or code compliance risk
  },
  PROJECT_RISK_ROLLUP: {
    enabled: true,
    high_open_alerts: 5,    // 5+ open alerts = high project risk
    critical_open_alerts: 10, // 10+ open alerts = project in trouble
    force_critical_if_any_critical: true,
  },
};

const CLOSED_RFI_STATUSES = new Set(['closed', 'answered', 'resolved']);
const CLOSED_INVOICE_STATUSES = new Set(['paid', 'void', 'cancelled', 'canceled']);
const CLOSED_TASK_STATUSES = new Set(['complete', 'completed', 'done', 'closed']);
const CLOSED_ISSUE_STATUSES = new Set(['closed', 'resolved']);

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function numberOrZero(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateOnlyTimestamp(dateLike: string | Date): number {
  const d = new Date(dateLike);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysPast(dateLike: string | Date, now: Date): number {
  return Math.max(0, Math.floor((dateOnlyTimestamp(now) - dateOnlyTimestamp(dateLike)) / 86400000));
}

function severityFromDays(
  days: number,
  config: { medium_after_days: number; high_after_days: number; critical_after_days: number },
): Severity | null {
  if (days >= config.critical_after_days) return 'critical';
  if (days >= config.high_after_days) return 'high';
  if (days >= config.medium_after_days) return 'medium';
  return null;
}

function bumpSeverity(current: Severity, next: Severity): Severity {
  const order: Severity[] = ['low', 'medium', 'high', 'critical'];
  return order.indexOf(next) > order.indexOf(current) ? next : current;
}

function sha(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function makeAlert(args: {
  tenantId: string;
  projectId?: string | null;
  entityType: EntityType;
  entityId?: string | null;
  ruleCode: RuleCode;
  title: string;
  summary: string;
  severity: Severity;
  metadata?: Record<string, unknown>;
  nowIso: string;
}): CandidateAlert {
  const payloadForFingerprint = [
    args.tenantId,
    args.projectId ?? '',
    args.entityType,
    args.entityId ?? '',
    args.ruleCode,
  ].join('|');

  return {
    tenant_id: args.tenantId,
    project_id: args.projectId ?? null,
    entity_type: args.entityType,
    entity_id: args.entityId ?? null,
    rule_code: args.ruleCode,
    title: args.title,
    summary: args.summary,
    severity: args.severity,
    status: 'open',
    fingerprint: sha(payloadForFingerprint),
    metadata: args.metadata ?? {},
    last_detected_at: args.nowIso,
    resolved_at: null,
  };
}

async function loadRuleConfig(tenantId: string): Promise<RuleConfig> {
  const { data, error } = await supabaseAdmin
    .from('autopilot_rule_settings')
    .select('rule_code, is_enabled, thresholds')
    .eq('tenant_id', tenantId);

  if (error) throw error;

  const merged: RuleConfig = JSON.parse(JSON.stringify(DEFAULTS));

  for (const row of data ?? []) {
    const ruleCode = row.rule_code as RuleCode;
    if (!(ruleCode in merged)) continue;

    const current = merged[ruleCode as keyof RuleConfig] as Record<string, unknown>;
    const thresholds = (row.thresholds ?? {}) as Record<string, unknown>;

    (merged as Record<string, Record<string, unknown>>)[ruleCode] = {
      ...current,
      ...thresholds,
      enabled: row.is_enabled ?? true,
    };
  }

  return merged;
}

const FETCH_PAGE_SIZE = 1000;

async function fetchRows(table: string, scope: AutopilotScope) {
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    let query = supabaseAdmin
      .from(table)
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .range(from, from + FETCH_PAGE_SIZE - 1);

    if (scope.projectId) {
      query = query.eq('project_id', scope.projectId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = data ?? [];
    allRows.push(...page);

    if (page.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return allRows;
}

function buildRfiAlerts(rows: any[], tenantId: string, now: Date, nowIso: string, config: RuleConfig['RFI_OVERDUE']) {
  if (!config.enabled) return [] as CandidateAlert[];

  return rows.flatMap((row) => {
    const status = normalizeStatus(row.status);
    if (CLOSED_RFI_STATUSES.has(status)) return [];

    const dueDate = row.due_date ?? row.response_due_date;
    if (!dueDate) return [];

    const overdueDays = daysPast(dueDate, now);
    const severity = severityFromDays(overdueDays, config);
    if (!severity) return [];

    const rfiNumber = row.number ?? row.rfi_number ?? row.code ?? row.id;
    const title = row.title ?? row.subject ?? `RFI ${rfiNumber}`;

    return [
      makeAlert({
        tenantId,
        projectId: row.project_id ?? null,
        entityType: 'rfi',
        entityId: row.id,
        ruleCode: 'RFI_OVERDUE',
        title: `Overdue RFI ${rfiNumber}`,
        summary: `${title} is ${overdueDays} day(s) overdue and still ${status || 'open'}.`,
        severity,
        metadata: {
          rfiNumber,
          sourceStatus: row.status ?? null,
          dueDate,
          overdueDays,
          assignedTo: row.assigned_to ?? null,
        },
        nowIso,
      }),
    ];
  });
}

function buildInvoiceAlerts(
  rows: any[],
  tenantId: string,
  now: Date,
  nowIso: string,
  config: RuleConfig['INVOICE_OVERDUE'],
) {
  if (!config.enabled) return [] as CandidateAlert[];

  return rows.flatMap((row) => {
    const status = normalizeStatus(row.status);
    if (CLOSED_INVOICE_STATUSES.has(status)) return [];

    const dueDate = row.due_date ?? row.payment_due_date;
    if (!dueDate) return [];

    const balanceDue = numberOrZero(row.balance_due ?? row.outstanding_balance ?? row.amount_due);
    if (balanceDue <= 0) return [];

    const overdueDays = daysPast(dueDate, now);
    let severity = severityFromDays(overdueDays, config);
    if (!severity) return [];

    if (balanceDue >= config.critical_balance) {
      severity = 'critical';
    } else if (balanceDue >= config.high_balance) {
      severity = bumpSeverity(severity, 'high');
    }

    const invoiceNumber = row.invoice_number ?? row.number ?? row.reference_number ?? row.id;
    const vendorName = row.vendor_name ?? row.vendor ?? row.subcontractor_name ?? 'vendor';

    return [
      makeAlert({
        tenantId,
        projectId: row.project_id ?? null,
        entityType: 'invoice',
        entityId: row.id,
        ruleCode: 'INVOICE_OVERDUE',
        title: `Unpaid invoice ${invoiceNumber}`,
        summary: `Invoice ${invoiceNumber} from ${vendorName} is ${overdueDays} day(s) overdue with ${balanceDue.toFixed(2)} still outstanding.`,
        severity,
        metadata: {
          invoiceNumber,
          vendorName,
          sourceStatus: row.status ?? null,
          dueDate,
          overdueDays,
          balanceDue,
          totalAmount: numberOrZero(row.total_amount ?? row.amount ?? row.total),
        },
        nowIso,
      }),
    ];
  });
}

function buildScheduleAlerts(
  rows: any[],
  tenantId: string,
  now: Date,
  nowIso: string,
  config: RuleConfig['SCHEDULE_SLIPPAGE'],
) {
  if (!config.enabled) return [] as CandidateAlert[];

  return rows.flatMap((row) => {
    const status = normalizeStatus(row.status);
    if (CLOSED_TASK_STATUSES.has(status)) return [];

    const baselineDate = row.baseline_finish_date ?? row.baseline_end_date ?? row.planned_finish_date ?? row.finish_date;
    if (!baselineDate) return [];

    if (row.actual_finish_date || row.completed_at) return [];

    const delayDays = daysPast(baselineDate, now);
    if (delayDays <= 0) return [];

    // Only flag non-critical-path tasks when delay is significant (≥ high threshold).
    // Critical path tasks get alerted at the normal thresholds.
    const isCriticalPath = Boolean(row.is_critical_path ?? row.critical_path ?? false);
    const effectiveConfig = isCriticalPath
      ? config
      : { ...config, medium_after_days: config.high_after_days, high_after_days: config.critical_after_days };

    const severity = severityFromDays(delayDays, effectiveConfig);
    if (!severity) return [];

    const taskName = row.name ?? row.title ?? row.task_name ?? `Task ${row.id}`;
    const pct = numberOrZero(row.percent_complete);
    const criticalContext = isCriticalPath
      ? ' ⚠️ CRITICAL PATH — project end date at risk.'
      : ` (${pct}% complete, non-critical path)`;

    return [
      makeAlert({
        tenantId,
        projectId: row.project_id ?? null,
        entityType: 'schedule_task',
        entityId: row.id,
        ruleCode: 'SCHEDULE_SLIPPAGE',
        title: `${isCriticalPath ? '⚠️ Critical path delay' : 'Schedule slippage'}: ${taskName}`,
        summary: `${taskName} is ${delayDays} day(s) behind baseline (${pct}% complete).${criticalContext}`,
        severity,
        metadata: {
          taskName,
          baselineDate,
          delayDays,
          percentComplete: pct,
          isCriticalPath,
          predecessorIds: row.predecessor_ids ?? row.predecessors ?? [],
          phase: row.phase ?? null,
        },
        nowIso,
      }),
    ];
  });
}

function buildFieldIssueAlerts(
  rows: any[],
  tenantId: string,
  now: Date,
  nowIso: string,
  config: RuleConfig['FIELD_ISSUE_UNRESOLVED'],
) {
  if (!config.enabled) return [] as CandidateAlert[];

  return rows.flatMap((row) => {
    const status = normalizeStatus(row.status);
    if (CLOSED_ISSUE_STATUSES.has(status)) return [];

    const issueAgeAnchor = row.due_date ?? row.target_date ?? row.created_at ?? row.opened_at;
    if (!issueAgeAnchor) return [];

    const ageDays = daysPast(issueAgeAnchor, now);
    let severity = severityFromDays(ageDays, config);
    if (!severity) return [];

    const sourceSeverity = normalizeStatus(row.severity);
    if (sourceSeverity === 'critical') {
      severity = 'critical';
    } else if (sourceSeverity === 'high') {
      severity = bumpSeverity(severity, 'high');
    }

    const issueTitle = row.title ?? row.subject ?? row.name ?? `Field issue ${row.id}`;

    return [
      makeAlert({
        tenantId,
        projectId: row.project_id ?? null,
        entityType: 'field_issue',
        entityId: row.id,
        ruleCode: 'FIELD_ISSUE_UNRESOLVED',
        title: `Unresolved field issue: ${issueTitle}`,
        summary: `${issueTitle} has been unresolved for ${ageDays} day(s) and is still ${status || 'open'}.`,
        severity,
        metadata: {
          issueTitle,
          sourceSeverity: row.severity ?? null,
          sourceStatus: row.status ?? null,
          ageDays,
          dueDate: row.due_date ?? row.target_date ?? null,
          assignedTo: row.assigned_to ?? null,
        },
        nowIso,
      }),
    ];
  });
}

type PersistedAlertSummary = {
  project_id: string | null;
  rule_code: string;
  severity: Severity;
  fingerprint: string;
};

function buildProjectRollupAlerts(
  currentAlerts: CandidateAlert[],
  persistedAlerts: PersistedAlertSummary[],
  tenantId: string,
  nowIso: string,
  config: RuleConfig['PROJECT_RISK_ROLLUP'],
) {
  if (!config.enabled) return [] as CandidateAlert[];

  // Start from the current run's fingerprints so we know which persisted ones
  // are still active (not stale) vs. newly generated.
  const currentFingerprints = new Set(currentAlerts.map((a) => a.fingerprint));

  // Build a unified alert view: current-run alerts + persisted alerts that are
  // still open/acknowledged but not regenerated this run (acknowledged alerts,
  // for example). Exclude PROJECT_RISK_ROLLUP itself to avoid double-counting.
  const unified = new Map<string, { project_id: string; rule_code: string; severity: Severity }>();

  for (const a of currentAlerts) {
    if (!a.project_id || a.rule_code === 'PROJECT_RISK_ROLLUP') continue;
    unified.set(a.fingerprint, { project_id: a.project_id, rule_code: a.rule_code, severity: a.severity });
  }

  for (const p of persistedAlerts) {
    if (!p.project_id || p.rule_code === 'PROJECT_RISK_ROLLUP') continue;
    // Only include persisted alerts not regenerated this run (e.g. acknowledged).
    if (!currentFingerprints.has(p.fingerprint)) {
      unified.set(p.fingerprint, { project_id: p.project_id, rule_code: p.rule_code, severity: p.severity });
    }
  }

  const grouped = new Map<string, Array<{ rule_code: string; severity: Severity }>>();

  for (const entry of unified.values()) {
    if (!grouped.has(entry.project_id)) grouped.set(entry.project_id, []);
    grouped.get(entry.project_id)!.push(entry);
  }

  const results: CandidateAlert[] = [];

  for (const [projectId, projectAlerts] of grouped.entries()) {
    const criticalCount = projectAlerts.filter((a) => a.severity === 'critical').length;
    const highCount = projectAlerts.filter((a) => a.severity === 'high').length;
    const openCount = projectAlerts.length;
    // satisfy TS — childRuleCodes still derived from the unified entries
    const childRuleCodes = [...new Set(projectAlerts.map((a) => a.rule_code))];

    let severity: Severity | null = null;

    if (config.force_critical_if_any_critical && criticalCount > 0) {
      severity = 'critical';
    } else if (openCount >= config.critical_open_alerts) {
      severity = 'critical';
    } else if (openCount >= config.high_open_alerts || highCount >= 2) {
      severity = 'high';
    }

    if (!severity) continue;

    results.push(
      makeAlert({
        tenantId,
        projectId,
        entityType: 'project',
        entityId: projectId,
        ruleCode: 'PROJECT_RISK_ROLLUP',
        title: 'Project risk escalation detected',
        summary: `Autopilot detected ${openCount} active risk alert(s), including ${highCount} high and ${criticalCount} critical alert(s).`,
        severity,
        metadata: {
          openCount,
          highCount,
          criticalCount,
          childRuleCodes,
        },
        nowIso,
      }),
    );
  }

  return results;
}

async function persistAlerts(scope: AutopilotScope, alerts: CandidateAlert[], nowIso: string) {
  const seenFingerprints = new Set(alerts.map((alert) => alert.fingerprint));

  if (alerts.length > 0) {
    const { error } = await supabaseAdmin
      .from('autopilot_alerts')
      .upsert(alerts, { onConflict: 'tenant_id,fingerprint' });

    if (error) throw error;
  }

  let existingQuery = supabaseAdmin
    .from('autopilot_alerts')
    .select('id, fingerprint')
    .eq('tenant_id', scope.tenantId)
    .in('rule_code', HANDLED_RULES)
    .in('status', ['open', 'acknowledged']);

  if (scope.projectId) {
    existingQuery = existingQuery.eq('project_id', scope.projectId);
  }

  const { data: existing, error: existingError } = await existingQuery;
  if (existingError) throw existingError;

  const staleIds = (existing ?? [])
    .filter((row: any) => !seenFingerprints.has(row.fingerprint))
    .map((row: any) => row.id);

  if (staleIds.length > 0) {
    const { error: resolveError } = await supabaseAdmin
      .from('autopilot_alerts')
      .update({
        status: 'resolved',
        resolved_at: nowIso,
        updated_at: nowIso,
      })
      .in('id', staleIds);

    if (resolveError) throw resolveError;
  }

  return {
    upserted: alerts.length,
    resolved: staleIds.length,
  };
}

function summarizeBySeverity(alerts: CandidateAlert[]) {
  return alerts.reduce(
    (acc, alert) => {
      acc[alert.severity] += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0, critical: 0 } as Record<Severity, number>,
  );
}

async function fetchPersistedOpenAlerts(scope: AutopilotScope): Promise<PersistedAlertSummary[]> {
  let query = supabaseAdmin
    .from('autopilot_alerts')
    .select('project_id, rule_code, severity, fingerprint')
    .eq('tenant_id', scope.tenantId)
    .in('status', ['open', 'acknowledged'])
    .neq('rule_code', 'PROJECT_RISK_ROLLUP');

  if (scope.projectId) {
    query = query.eq('project_id', scope.projectId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PersistedAlertSummary[];
}

export async function runAutopilot(scope: AutopilotScope) {
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: runRecord, error: runInsertError } = await supabaseAdmin
    .from('autopilot_runs')
    .insert({
      tenant_id: scope.tenantId,
      project_id: scope.projectId ?? null,
      started_at: nowIso,
      status: 'running',
    })
    .select('id')
    .single();

  if (runInsertError) throw runInsertError;

  try {
    const config = await loadRuleConfig(scope.tenantId);

    const [rfis, invoices, tasks, fieldIssues, persistedOpenAlerts] = await Promise.all([
      fetchRows('rfis', scope),
      fetchRows('invoices', scope),
      fetchRows('schedule_tasks', scope),
      fetchRows('field_issues', scope),
      fetchPersistedOpenAlerts(scope),
    ]);

    const alerts = [
      ...buildRfiAlerts(rfis, scope.tenantId, now, nowIso, config.RFI_OVERDUE),
      ...buildInvoiceAlerts(invoices, scope.tenantId, now, nowIso, config.INVOICE_OVERDUE),
      ...buildScheduleAlerts(tasks, scope.tenantId, now, nowIso, config.SCHEDULE_SLIPPAGE),
      ...buildFieldIssueAlerts(fieldIssues, scope.tenantId, now, nowIso, config.FIELD_ISSUE_UNRESOLVED),
    ];

    const rollups = buildProjectRollupAlerts(alerts, persistedOpenAlerts, scope.tenantId, nowIso, config.PROJECT_RISK_ROLLUP);
    const allAlerts = [...alerts, ...rollups];
    const persistSummary = await persistAlerts(scope, allAlerts, nowIso);

    const summary = {
      tenantId: scope.tenantId,
      projectId: scope.projectId ?? null,
      totalAlerts: allAlerts.length,
      bySeverity: summarizeBySeverity(allAlerts),
      byRule: {
        RFI_OVERDUE: allAlerts.filter((a) => a.rule_code === 'RFI_OVERDUE').length,
        INVOICE_OVERDUE: allAlerts.filter((a) => a.rule_code === 'INVOICE_OVERDUE').length,
        SCHEDULE_SLIPPAGE: allAlerts.filter((a) => a.rule_code === 'SCHEDULE_SLIPPAGE').length,
        FIELD_ISSUE_UNRESOLVED: allAlerts.filter((a) => a.rule_code === 'FIELD_ISSUE_UNRESOLVED').length,
        PROJECT_RISK_ROLLUP: allAlerts.filter((a) => a.rule_code === 'PROJECT_RISK_ROLLUP').length,
      },
      upserted: persistSummary.upserted,
      resolved: persistSummary.resolved,
      finishedAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from('autopilot_runs')
      .update({
        status: 'succeeded',
        finished_at: summary.finishedAt,
        summary,
      })
      .eq('id', runRecord.id);

    if (updateError) throw updateError;

    return summary;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    if (runRecord?.id) {
      await supabaseAdmin
        .from('autopilot_runs')
        .update({
          status: 'failed',
          finished_at: finishedAt,
          error: error instanceof Error ? error.message : 'Unknown autopilot error',
        })
        .eq('id', runRecord.id);
    }

    throw error;
  }
}
