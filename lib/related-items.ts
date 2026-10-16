/**
 * Related Items — the one link between any two records on a job
 * (procore-parity-spec §1.5). Client-safe: no server imports.
 *
 * A link is written once to `related_items` and shown on both records. The
 * pair is stored in a fixed order (see `orderPair`) and the database refuses
 * a second copy of it, refuses a link across companies or jobs, and refuses an
 * unknown type (supabase/migrations/20261016b_related_items.sql).
 *
 * Every column named here exists on the live table (checked Oct 16, 2026).
 */
import type { PermCategory } from '@/lib/permission-categories';

export const RELATED_TYPE_KEYS = [
  'rfi', 'submittal', 'change_order', 'punch_item', 'daily_log', 'drawing', 'document', 'photo',
  'inspection', 'meeting', 'schedule_task', 'commitment', 'purchase_order', 'pay_app', 'invoice', 'incident',
] as const;
export type RelatedType = (typeof RELATED_TYPE_KEYS)[number];

export type RelatedDef = {
  type: RelatedType;
  table: string;
  noun: string;
  plural: string;
  /** Permission category that guards the record. */
  perm: PermCategory;
  /** Column holding the record number, if it has one. */
  numberKey: string | null;
  /** True when that column is an integer (search by number uses eq, not ilike). */
  numberIsInt?: boolean;
  numberPrefix: string;
  /** First non-empty column is the title. */
  titleKeys: string[];
  statusKey: string | null;
  hasDeletedAt: boolean;
  /** Text columns the picker searches. */
  searchKeys: string[];
  /** Where the record opens. */
  href: (projectId: string, id: string) => string;
};

const p = (projectId: string) => `/app/projects/${projectId}`;
const item = (tool: string) => (projectId: string, id: string) => `${p(projectId)}/items/${tool}/${id}`;

export const RELATED_TYPES: Record<RelatedType, RelatedDef> = {
  rfi: {
    type: 'rfi', table: 'rfis', noun: 'RFI', plural: 'RFIs', perm: 'RFIs',
    numberKey: 'rfi_number', numberPrefix: 'RFI #', titleKeys: ['subject'], statusKey: 'status', hasDeletedAt: true,
    searchKeys: ['subject', 'rfi_number'], href: item('rfis'),
  },
  submittal: {
    type: 'submittal', table: 'submittals', noun: 'Submittal', plural: 'Submittals', perm: 'Submittals',
    numberKey: 'submittal_number', numberPrefix: 'Submittal #', titleKeys: ['title'], statusKey: 'status', hasDeletedAt: true,
    searchKeys: ['title', 'submittal_number', 'spec_section'], href: item('submittals'),
  },
  change_order: {
    type: 'change_order', table: 'change_orders', noun: 'Change order', plural: 'Change orders', perm: 'Change Orders',
    numberKey: 'co_number', numberIsInt: true, numberPrefix: 'CO #', titleKeys: ['title'], statusKey: 'status', hasDeletedAt: true,
    searchKeys: ['title', 'pco_number'], href: item('change_orders'),
  },
  punch_item: {
    type: 'punch_item', table: 'punch_list', noun: 'Punch item', plural: 'Punch items', perm: 'Projects',
    numberKey: 'item_number', numberIsInt: true, numberPrefix: 'Punch #', titleKeys: ['title'], statusKey: 'status', hasDeletedAt: true,
    searchKeys: ['title', 'location'], href: item('punch_list'),
  },
  daily_log: {
    type: 'daily_log', table: 'daily_logs', noun: 'Daily log', plural: 'Daily logs', perm: 'Projects',
    numberKey: 'log_date', numberPrefix: 'Daily log ', titleKeys: ['phase_of_work', 'work_performed'], statusKey: 'status', hasDeletedAt: true,
    searchKeys: ['work_performed', 'superintendent', 'phase_of_work'], href: item('daily_logs'),
  },
  drawing: {
    type: 'drawing', table: 'drawings', noun: 'Drawing', plural: 'Drawings', perm: 'Documents',
    numberKey: 'sheet_number', numberPrefix: '', titleKeys: ['name'], statusKey: 'status', hasDeletedAt: true,
    searchKeys: ['sheet_number', 'name'], href: (pid, id) => `${p(pid)}/drawings/${id}`,
  },
  document: {
    type: 'document', table: 'project_files', noun: 'Document', plural: 'Documents', perm: 'Documents',
    numberKey: null, numberPrefix: '', titleKeys: ['file_name'], statusKey: null, hasDeletedAt: true,
    searchKeys: ['file_name'], href: (pid, id) => `${p(pid)}/files?file=${id}`,
  },
  photo: {
    type: 'photo', table: 'photos', noun: 'Photo', plural: 'Photos', perm: 'Documents',
    numberKey: null, numberPrefix: '', titleKeys: ['title', 'caption', 'filename'], statusKey: null, hasDeletedAt: true,
    searchKeys: ['title', 'caption', 'filename', 'location'], href: (pid, id) => `${p(pid)}/photos?photo=${id}`,
  },
  inspection: {
    type: 'inspection', table: 'inspections', noun: 'Inspection', plural: 'Inspections', perm: 'Safety',
    numberKey: 'permit_number', numberPrefix: 'Permit ', titleKeys: ['inspection_type'], statusKey: 'status', hasDeletedAt: false,
    searchKeys: ['inspection_type', 'permit_number', 'inspector_name'], href: item('inspections'),
  },
  meeting: {
    type: 'meeting', table: 'meetings', noun: 'Meeting', plural: 'Meetings', perm: 'Projects',
    numberKey: 'meeting_number', numberIsInt: true, numberPrefix: 'Meeting #', titleKeys: ['title', 'meeting_type'], statusKey: 'status', hasDeletedAt: false,
    searchKeys: ['title', 'meeting_type'], href: (pid, id) => `${p(pid)}/meetings/${id}`,
  },
  schedule_task: {
    type: 'schedule_task', table: 'schedule_tasks', noun: 'Schedule task', plural: 'Schedule tasks', perm: 'Schedule',
    numberKey: 'wbs', numberPrefix: 'WBS ', titleKeys: ['name'], statusKey: 'status', hasDeletedAt: false,
    searchKeys: ['name', 'wbs', 'trade'], href: (_pid, id) => `/app/schedule/${id}`,
  },
  commitment: {
    type: 'commitment', table: 'contracts', noun: 'Subcontract', plural: 'Subcontracts', perm: 'Budget',
    numberKey: 'contract_number', numberPrefix: 'SC #', titleKeys: ['party_name', 'title'], statusKey: 'status', hasDeletedAt: false,
    searchKeys: ['party_name', 'title', 'contract_number', 'trade'], href: item('contracts'),
  },
  purchase_order: {
    type: 'purchase_order', table: 'purchase_orders', noun: 'Purchase order', plural: 'Purchase orders', perm: 'Budget',
    numberKey: 'po_number', numberPrefix: 'PO #', titleKeys: ['vendor_name', 'description'], statusKey: 'status', hasDeletedAt: false,
    searchKeys: ['vendor_name', 'po_number', 'description'], href: item('purchase_orders'),
  },
  pay_app: {
    type: 'pay_app', table: 'pay_applications', noun: 'Pay app', plural: 'Pay apps', perm: 'Pay Apps',
    numberKey: 'app_number', numberIsInt: true, numberPrefix: 'Pay App #', titleKeys: ['contract_name', 'period_to'], statusKey: 'status', hasDeletedAt: true,
    searchKeys: ['contract_name', 'contractor_name'], href: (pid, id) => `${p(pid)}/pay-apps/${id}`,
  },
  invoice: {
    type: 'invoice', table: 'invoices', noun: 'Invoice', plural: 'Invoices', perm: 'Budget',
    numberKey: 'invoice_number', numberPrefix: 'Invoice ', titleKeys: ['vendor_name', 'description'], statusKey: 'status', hasDeletedAt: false,
    searchKeys: ['invoice_number', 'vendor_name', 'description'], href: (pid) => `${p(pid)}/invoices`,
  },
  incident: {
    type: 'incident', table: 'safety_incidents', noun: 'Incident', plural: 'Incidents', perm: 'Safety',
    numberKey: 'incident_number', numberPrefix: 'Incident ', titleKeys: ['incident_type', 'description'], statusKey: 'status', hasDeletedAt: true,
    searchKeys: ['incident_number', 'description', 'location'], href: (pid) => `${p(pid)}/safety`,
  },
};

export function isRelatedType(t: unknown): t is RelatedType {
  return typeof t === 'string' && (RELATED_TYPE_KEYS as readonly string[]).includes(t);
}

/** The item pages' tool keys (lib/items/registry) → related type. */
export const RELATED_TYPE_FOR_TOOL: Record<string, RelatedType> = {
  rfis: 'rfi', submittals: 'submittal', punch_list: 'punch_item', daily_logs: 'daily_log',
  change_orders: 'change_order', inspections: 'inspection', contracts: 'commitment', purchase_orders: 'purchase_order',
};

/** Drawing-pin entity types (drawing_pins.entity_type) → related type. */
export function relatedTypeForPin(entityType: string | null | undefined): RelatedType | null {
  switch (entityType) {
    case 'rfi': case 'rfis': return 'rfi';
    case 'punch_item': case 'punch': case 'punch_list': return 'punch_item';
    case 'submittal': case 'submittals': return 'submittal';
    case 'daily_log': case 'daily_logs': return 'daily_log';
    default:
      if (isRelatedType(entityType)) return entityType;
      return entityType && Object.prototype.hasOwnProperty.call(RELATED_TYPE_FOR_TOOL, entityType) ? RELATED_TYPE_FOR_TOOL[entityType] : null;
  }
}

export type RecordRef = { type: RelatedType; id: string };

/**
 * The stored order of a pair: by type (byte order), then by id. The database
 * enforces the same order with COLLATE "C", and lowercase uuid text sorts the
 * way Postgres sorts uuids, so both sides agree.
 */
export function orderPair(x: RecordRef, y: RecordRef): [RecordRef, RecordRef] {
  const a = { type: x.type, id: x.id.toLowerCase() };
  const b = { type: y.type, id: y.id.toLowerCase() };
  if (a.type < b.type) return [a, b];
  if (a.type > b.type) return [b, a];
  return a.id <= b.id ? [a, b] : [b, a];
}

/** "RFI #12", "A-101", "Daily log Oct 3, 2026" — a number that carries its own letters is shown as typed. */
export function relatedNumber(def: RelatedDef, row: Record<string, unknown>): string {
  if (!def.numberKey) return '';
  const n = row[def.numberKey];
  if (n == null || n === '') return '';
  const s = String(n).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${def.numberPrefix}${new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return /^[A-Za-z]/.test(s) || !def.numberPrefix ? s : `${def.numberPrefix}${s}`;
}

export function relatedTitle(def: RelatedDef, row: Record<string, unknown>): string {
  for (const k of def.titleKeys) {
    const v = row[k];
    if (v == null || v === '') continue;
    const s = String(v).trim();
    if (!s) continue;
    if (k === 'period_to' && /^\d{4}-\d{2}-\d{2}/.test(s)) {
      return `Period to ${new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return s.length > 140 ? `${s.slice(0, 137)}…` : s;
  }
  return def.noun;
}

/** What the API returns for one linked record. */
export type RelatedRow = {
  linkId: string;
  type: RelatedType;
  id: string;
  noun: string;
  number: string;
  title: string;
  status: string | null;
  /** Table name — the status-system module for StatusPill. */
  statusModule: string;
  href: string;
  projectId: string | null;
  /** Set when the link is a pin on a drawing. */
  pin: { drawingId: string; sheet: string; x: number; y: number; page: number; pinId: string | null } | null;
  createdAt: string;
};

/** One search hit for the "Add link" picker. */
export type RelatedHit = {
  type: RelatedType;
  id: string;
  noun: string;
  number: string;
  title: string;
  status: string | null;
  statusModule: string;
};
