/**
 * Item registry — one description per tool, so a single item page, a single
 * item API and a single search serve RFIs, submittals, punch items, change
 * orders, inspections and daily logs alike.
 *
 * Every column named here exists on the live table (checked Oct 15, 2026).
 * `edit` lists the only columns the item API will write; anything else in a
 * PATCH body is dropped, so a field shown read-only can never be changed
 * through the generic route.
 */
import type { PermCategory } from '@/lib/permission-categories';

export type FieldKind = 'text' | 'long' | 'date' | 'datetime' | 'money' | 'number' | 'bool' | 'select';

export type ItemField = {
  key: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  /** Shown in the workflow strip at the top of the page. */
  strip?: boolean;
};

export type ItemTool = {
  /** URL segment and audit/link entity_type (the table name). */
  type: string;
  table: string;
  /** What a person calls one of these. */
  noun: string;
  plural: string;
  /** Permission category that guards it. */
  perm: PermCategory;
  /** The list screen under /app/projects/[id]/ */
  listPath: string;
  numberKey: string;
  titleKey: string;
  /** Prefix before the number ("RFI #12"). */
  numberPrefix: string;
  statusKey: string;
  statuses: string[];
  hasDeletedAt: boolean;
  /** Table has updated_at (inspections does not). Defaults to true. */
  hasUpdatedAt?: boolean;
  fields: ItemField[];
  edit: string[];
  /** Columns the cross-tool search reads. */
  searchKeys: string[];
};

const ref = (label = 'Drawing reference'): ItemField => ({ key: 'drawing_reference', label, kind: 'text' });

export const ITEM_TOOLS: Record<string, ItemTool> = {
  rfis: {
    type: 'rfis', table: 'rfis', noun: 'RFI', plural: 'RFIs', perm: 'RFIs', listPath: 'rfis',
    numberKey: 'rfi_number', titleKey: 'subject', numberPrefix: 'RFI #', statusKey: 'status',
    statuses: ['draft', 'open', 'submitted', 'under_review', 'answered', 'closed'], hasDeletedAt: true,
    fields: [
      { key: 'status', label: 'Status', kind: 'select', options: ['draft', 'open', 'submitted', 'under_review', 'answered', 'closed'], strip: true },
      { key: 'ball_in_court', label: 'Ball in court', kind: 'text', strip: true },
      { key: 'due_date', label: 'Due', kind: 'date', strip: true },
      { key: 'submitted_by', label: 'Created by', kind: 'text', strip: true },
      { key: 'assigned_to_name', label: 'Assigned to', kind: 'text', strip: true },
      { key: 'priority', label: 'Priority', kind: 'select', options: ['low', 'normal', 'high', 'critical'] },
      { key: 'is_urgent', label: 'Urgent', kind: 'bool' },
      { key: 'question', label: 'Question', kind: 'long' },
      { key: 'answer', label: 'Official answer', kind: 'long' },
      { key: 'answered_by', label: 'Answered by', kind: 'text' },
      { key: 'answered_at', label: 'Answered', kind: 'datetime' },
      { key: 'spec_section', label: 'Spec section', kind: 'text' },
      ref(),
      { key: 'assigned_to_company', label: 'Assignee company', kind: 'text' },
      { key: 'assigned_to_email', label: 'Assignee email', kind: 'text' },
      { key: 'cost_impact', label: 'Cost impact', kind: 'money' },
      { key: 'cost_impact_direction', label: 'Cost direction', kind: 'select', options: ['add', 'deduct', 'none'] },
      { key: 'schedule_impact_days', label: 'Schedule impact (days)', kind: 'number' },
      { key: 'impact_description', label: 'Impact', kind: 'long' },
      { key: 'internal_notes', label: 'Internal notes', kind: 'long' },
      { key: 'closed_at', label: 'Closed', kind: 'datetime' },
      { key: 'created_at', label: 'Created', kind: 'datetime' },
    ],
    edit: ['subject', 'status', 'ball_in_court', 'due_date', 'assigned_to_name', 'assigned_to_company', 'assigned_to_email', 'priority', 'is_urgent', 'question', 'answer', 'answered_by', 'spec_section', 'drawing_reference', 'cost_impact', 'cost_impact_direction', 'schedule_impact_days', 'impact_description', 'internal_notes'],
    searchKeys: ['subject', 'question', 'rfi_number'],
  },
  submittals: {
    type: 'submittals', table: 'submittals', noun: 'Submittal', plural: 'Submittals', perm: 'Submittals', listPath: 'submittals',
    numberKey: 'submittal_number', titleKey: 'title', numberPrefix: 'Submittal #', statusKey: 'status',
    statuses: ['draft', 'pending', 'submitted', 'under_review', 'approved', 'approved_as_noted', 'revise_resubmit', 'rejected', 'closed'], hasDeletedAt: true,
    fields: [
      { key: 'status', label: 'Status', kind: 'select', options: ['draft', 'pending', 'submitted', 'under_review', 'approved', 'approved_as_noted', 'revise_resubmit', 'rejected', 'closed'], strip: true },
      { key: 'ball_in_court', label: 'Ball in court', kind: 'text', strip: true },
      { key: 'due_date', label: 'Due', kind: 'date', strip: true },
      { key: 'submitted_by', label: 'Submitted by', kind: 'text', strip: true },
      { key: 'submitted_to', label: 'Reviewer', kind: 'text', strip: true },
      { key: 'spec_section', label: 'Spec section', kind: 'text' },
      { key: 'submittal_type', label: 'Type', kind: 'text' },
      { key: 'subcontractor', label: 'Subcontractor', kind: 'text' },
      { key: 'trade', label: 'Trade', kind: 'text' },
      { key: 'priority', label: 'Priority', kind: 'select', options: ['low', 'normal', 'high', 'critical'] },
      { key: 'revision_number', label: 'Revision', kind: 'number' },
      { key: 'description', label: 'Description', kind: 'long' },
      { key: 'review_action', label: 'Review action', kind: 'text' },
      { key: 'review_comments', label: 'Reviewer comments', kind: 'long' },
      { key: 'reviewed_by', label: 'Reviewed by', kind: 'text' },
      { key: 'reviewed_at', label: 'Reviewed', kind: 'datetime' },
      { key: 'required_lead_days', label: 'Lead time needed (days)', kind: 'number' },
      ref(),
      { key: 'cost_impact', label: 'Cost impact', kind: 'money' },
      { key: 'notes', label: 'Notes', kind: 'long' },
      { key: 'created_at', label: 'Created', kind: 'datetime' },
    ],
    edit: ['title', 'status', 'ball_in_court', 'due_date', 'submitted_by', 'submitted_to', 'spec_section', 'submittal_type', 'subcontractor', 'trade', 'priority', 'revision_number', 'description', 'review_action', 'review_comments', 'reviewed_by', 'required_lead_days', 'drawing_reference', 'cost_impact', 'notes'],
    searchKeys: ['title', 'description', 'submittal_number', 'spec_section'],
  },
  punch_list: {
    type: 'punch_list', table: 'punch_list', noun: 'Punch item', plural: 'Punch list', perm: 'Projects', listPath: 'punch-list',
    numberKey: 'item_number', titleKey: 'title', numberPrefix: 'Punch #', statusKey: 'status',
    statuses: ['open', 'in_progress', 'ready_for_review', 'completed', 'verified', 'closed'], hasDeletedAt: true,
    fields: [
      { key: 'status', label: 'Status', kind: 'select', options: ['open', 'in_progress', 'ready_for_review', 'completed', 'verified', 'closed'], strip: true },
      { key: 'assigned_to_name', label: 'Assignee', kind: 'text', strip: true },
      { key: 'assigned_sub_company', label: 'Company', kind: 'text', strip: true },
      { key: 'due_date', label: 'Due', kind: 'date', strip: true },
      { key: 'priority', label: 'Priority', kind: 'select', options: ['low', 'normal', 'high', 'critical'], strip: true },
      { key: 'description', label: 'Description', kind: 'long' },
      { key: 'location', label: 'Location', kind: 'text' },
      { key: 'floor_level', label: 'Floor', kind: 'text' },
      { key: 'room_number', label: 'Room', kind: 'text' },
      { key: 'trade', label: 'Trade', kind: 'text' },
      { key: 'spec_section', label: 'Spec section', kind: 'text' },
      { key: 'drawing_sheet_number', label: 'Drawing sheet', kind: 'text' },
      { key: 'cost_to_correct', label: 'Cost to correct', kind: 'money' },
      { key: 'correction_deadline', label: 'Correct by', kind: 'date' },
      { key: 'completed_by', label: 'Completed by', kind: 'text' },
      { key: 'completed_at', label: 'Completed', kind: 'datetime' },
      { key: 'verified_by', label: 'Verified by', kind: 'text' },
      { key: 'verified_at', label: 'Verified', kind: 'datetime' },
      { key: 'rejected_reason', label: 'Rejected because', kind: 'long' },
      { key: 'notes', label: 'Notes', kind: 'long' },
      { key: 'created_at', label: 'Created', kind: 'datetime' },
    ],
    edit: ['title', 'status', 'assigned_to_name', 'assigned_sub_company', 'due_date', 'priority', 'description', 'location', 'floor_level', 'room_number', 'trade', 'spec_section', 'drawing_sheet_number', 'cost_to_correct', 'correction_deadline', 'completed_by', 'verified_by', 'rejected_reason', 'notes'],
    searchKeys: ['title', 'description', 'location'],
  },
  daily_logs: {
    type: 'daily_logs', table: 'daily_logs', noun: 'Daily log', plural: 'Daily logs', perm: 'Projects', listPath: 'daily-logs',
    numberKey: 'log_date', titleKey: 'phase_of_work', numberPrefix: 'Daily log ', statusKey: 'status',
    statuses: ['draft', 'submitted', 'approved'], hasDeletedAt: true,
    fields: [
      { key: 'status', label: 'Status', kind: 'select', options: ['draft', 'submitted', 'approved'], strip: true },
      { key: 'log_date', label: 'Date', kind: 'date', strip: true },
      { key: 'superintendent', label: 'Superintendent', kind: 'text', strip: true },
      { key: 'manpower_count', label: 'Workers on site', kind: 'number', strip: true },
      { key: 'weather', label: 'Weather', kind: 'text', strip: true },
      { key: 'phase_of_work', label: 'Phase of work', kind: 'text' },
      { key: 'foreman_name', label: 'Foreman', kind: 'text' },
      { key: 'high_temp', label: 'High °F', kind: 'text' },
      { key: 'low_temp', label: 'Low °F', kind: 'text' },
      { key: 'work_performed', label: 'Work performed', kind: 'long' },
      { key: 'delays', label: 'Delays', kind: 'long' },
      { key: 'safety_notes', label: 'Safety notes', kind: 'long' },
      { key: 'notes', label: 'Notes', kind: 'long' },
      { key: 'approved_by', label: 'Approved by', kind: 'text' },
      { key: 'approved_at', label: 'Approved', kind: 'datetime' },
      { key: 'created_at', label: 'Created', kind: 'datetime' },
    ],
    edit: ['status', 'log_date', 'superintendent', 'phase_of_work', 'foreman_name', 'safety_notes', 'approved_by'],
    searchKeys: ['work_performed', 'notes', 'superintendent'],
  },
  change_orders: {
    type: 'change_orders', table: 'change_orders', noun: 'Change order', plural: 'Change orders', perm: 'Change Orders', listPath: 'change-orders',
    numberKey: 'co_number', titleKey: 'title', numberPrefix: 'CO #', statusKey: 'status',
    statuses: ['draft', 'pending', 'submitted', 'approved', 'rejected', 'void'], hasDeletedAt: true,
    fields: [
      { key: 'status', label: 'Status', kind: 'select', options: ['draft', 'pending', 'submitted', 'approved', 'rejected', 'void'], strip: true },
      { key: 'amount', label: 'Amount', kind: 'money', strip: true },
      { key: 'schedule_impact_days', label: 'Schedule impact (days)', kind: 'number', strip: true },
      { key: 'change_type', label: 'Type', kind: 'text', strip: true },
      { key: 'initiated_by', label: 'Initiated by', kind: 'text', strip: true },
      { key: 'pco_number', label: 'PCO #', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'long' },
      { key: 'scope_of_change', label: 'Scope of change', kind: 'long' },
      { key: 'reason', label: 'Reason', kind: 'long' },
      { key: 'labor_amount', label: 'Labor', kind: 'money' },
      { key: 'materials_amount', label: 'Materials', kind: 'money' },
      { key: 'equipment_amount', label: 'Equipment', kind: 'money' },
      { key: 'subtrade_amount', label: 'Subcontract', kind: 'money' },
      { key: 'overhead_amount', label: 'Overhead', kind: 'money' },
      { key: 'profit_amount', label: 'Profit', kind: 'money' },
      { key: 'billable_to', label: 'Billable to', kind: 'text' },
      { key: 'contract_reference', label: 'Contract reference', kind: 'text' },
      { key: 'revised_completion_date', label: 'Revised completion', kind: 'date' },
      { key: 'approved_by', label: 'Approved by', kind: 'text' },
      { key: 'approved_at', label: 'Approved', kind: 'datetime' },
      { key: 'rejection_reason', label: 'Rejected because', kind: 'long' },
      { key: 'notes', label: 'Notes', kind: 'long' },
      { key: 'created_at', label: 'Created', kind: 'datetime' },
    ],
    edit: ['title', 'status', 'amount', 'schedule_impact_days', 'change_type', 'initiated_by', 'pco_number', 'description', 'scope_of_change', 'reason', 'labor_amount', 'materials_amount', 'equipment_amount', 'subtrade_amount', 'overhead_amount', 'profit_amount', 'billable_to', 'contract_reference', 'revised_completion_date', 'rejection_reason', 'notes'],
    searchKeys: ['title', 'description', 'pco_number'],
  },
  inspections: {
    type: 'inspections', table: 'inspections', noun: 'Inspection', plural: 'Inspections', perm: 'Safety', listPath: 'inspections',
    numberKey: 'permit_number', titleKey: 'inspection_type', numberPrefix: 'Permit ', statusKey: 'status',
    statuses: ['scheduled', 'in_progress', 'completed', 'cancelled'], hasDeletedAt: false, hasUpdatedAt: false,
    fields: [
      { key: 'status', label: 'Status', kind: 'select', options: ['scheduled', 'in_progress', 'completed', 'cancelled'], strip: true },
      { key: 'result', label: 'Result', kind: 'select', options: ['pending', 'pass', 'fail', 'partial'], strip: true },
      { key: 'scheduled_date', label: 'Scheduled', kind: 'datetime', strip: true },
      { key: 'inspector_name', label: 'Inspector', kind: 'text', strip: true },
      { key: 'inspector_agency', label: 'Agency', kind: 'text', strip: true },
      { key: 'ahj_name', label: 'Authority having jurisdiction', kind: 'text' },
      { key: 'checklist_passed', label: 'Checklist items passed', kind: 'number' },
      { key: 'checklist_total', label: 'Checklist items', kind: 'number' },
      { key: 'deficiency_count', label: 'Deficiencies', kind: 'number' },
      { key: 'deficiency_notes', label: 'Deficiency notes', kind: 'long' },
      { key: 're_inspection_date', label: 'Re-inspection', kind: 'date' },
      { key: 'inspected_at', label: 'Inspected', kind: 'datetime' },
      { key: 'signed_off_by', label: 'Signed off by', kind: 'text' },
      { key: 'signed_off_at', label: 'Signed off', kind: 'datetime' },
      { key: 'weather', label: 'Weather', kind: 'text' },
      { key: 'notes', label: 'Notes', kind: 'long' },
      { key: 'created_at', label: 'Created', kind: 'datetime' },
    ],
    edit: ['inspection_type', 'status', 'result', 'inspector_name', 'inspector_agency', 'ahj_name', 'permit_number', 'deficiency_count', 'deficiency_notes', 're_inspection_date', 'signed_off_by', 'weather', 'notes'],
    searchKeys: ['inspection_type', 'notes', 'permit_number', 'inspector_name'],
  },
};

export function itemTool(type: string | undefined | null): ItemTool | null {
  return type && Object.prototype.hasOwnProperty.call(ITEM_TOOLS, type) ? ITEM_TOOLS[type] : null;
}

/** "under_review" → "Under review". */
export function statusLabel(s: string | null | undefined): string {
  if (!s) return '—';
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Readable name for an item row: "RFI #12 · Door hardware at level 2". */
export function itemName(tool: ItemTool, row: Record<string, unknown>): string {
  const t = String(row[tool.titleKey] ?? '').trim();
  const num = itemNumber(tool, row[tool.numberKey]) || tool.noun;
  return t ? `${num} · ${t}` : num;
}

/** "RFI #12" — but a number that already carries its own letters ("RFI-005") is shown as typed. */
export function itemNumber(tool: ItemTool, n: unknown): string {
  if (n == null || n === '') return '';
  const s = String(n).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${tool.numberPrefix}${new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return /^[A-Za-z]/.test(s) ? s : `${tool.numberPrefix}${s}`;
}

/** The noun inside a sentence: "this RFI", "this punch item". */
export function nounInSentence(tool: ItemTool): string {
  return tool.noun === tool.noun.toUpperCase() ? tool.noun : tool.noun.toLowerCase();
}

/** Keep only the columns a tool lets the item API write; coerce empties to null. */
export function pickEditable(tool: ItemTool, body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of tool.edit) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    const v = body[k];
    const f = tool.fields.find((x) => x.key === k);
    if (v === '' || v === undefined) { out[k] = null; continue; }
    if (f && (f.kind === 'money' || f.kind === 'number')) {
      const n = Number(v);
      out[k] = Number.isFinite(n) ? n : null;
      continue;
    }
    if (f && f.kind === 'bool') { out[k] = v === true || v === 'true'; continue; }
    out[k] = typeof v === 'string' ? v.slice(0, 20000) : v;
  }
  return out;
}
