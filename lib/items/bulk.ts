/**
 * Bulk edit for the item tools (RFIs, submittals, punch items, daily logs,
 * inspections, subcontracts, purchase orders): builds the kit DataTable's
 * `bulkEdit` so every row goes through PATCH /api/items/:tool/:id — the same
 * route the record's own edit uses. That route checks the tool's permission
 * (lib/items/registry `perm`), keeps to the editable columns, applies the
 * status side effects (closed_at, completed_at, executed_at, approved_at…)
 * and the history trigger records who changed what. Delete goes through the
 * tool's own DELETE route with its own (Full) permission check.
 *
 * Change orders and pay applications do NOT come through here: their status
 * moves through dedicated approve/reject routes with money side effects
 * (contract and budget cascade, lien waivers), and their screens wire those.
 */
import type { BulkEdit } from '@/components/ui/kit';
import { ITEM_TOOLS } from '@/lib/items/registry';
import { humanValue, jsonRequest } from '@/lib/list-view';

type Row = { id: string };

/** Which record field is "who has it" and which is "when it is due", per tool. */
const ASSIGNEE: Record<string, { fields: string[]; label: string } | undefined> = {
  rfis: { fields: ['ball_in_court', 'assigned_to_name'], label: 'Ball in court' },
  submittals: { fields: ['ball_in_court'], label: 'Ball in court' },
  punch_list: { fields: ['assigned_to_name'], label: 'Assign' },
};
const DUE: Record<string, { field: string; label: string } | undefined> = {
  rfis: { field: 'due_date', label: 'Set due date' },
  submittals: { field: 'due_date', label: 'Set due date' },
  punch_list: { field: 'due_date', label: 'Set due date' },
  purchase_orders: { field: 'delivery_date', label: 'Set delivery date' },
  inspections: { field: 're_inspection_date', label: 'Set re-inspection date' },
};

export function itemBulkEdit<T extends Row>(type: keyof typeof ITEM_TOOLS & string, o: {
  /** Edit rights on the tool's permission category (useEditRights(tool.perm).edit). */
  allowed: boolean;
  /** Full rights — delete. */
  canDelete?: boolean;
  /** The tool's own delete route for a row; omit to offer no delete. */
  deleteUrl?: (row: T) => string;
  /** Override the status choices (defaults to the registry's statuses). */
  statuses?: string[];
  /** People to pick from for the assignee; free text when empty. */
  people?: string[];
  onDone: () => void;
}): BulkEdit<T> {
  const tool = ITEM_TOOLS[type];
  const url = (r: T) => `/api/items/${tool.type}/${r.id}`;
  const statuses = o.statuses ?? tool.statuses;
  const asg = ASSIGNEE[tool.type];
  const due = DUE[tool.type];
  const people = Array.from(new Set((o.people ?? []).map((p) => p.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  return {
    noun: tool.noun.toLowerCase() === 'rfi' ? 'RFI' : tool.noun.toLowerCase(),
    allowed: o.allowed,
    status: {
      options: statuses.map((s) => ({ value: s, label: humanValue(s) })),
      apply: (r, v) => jsonRequest(url(r), 'PATCH', { [tool.statusKey]: v }),
    },
    assignee: asg && tool.edit.includes(asg.fields[0]) ? {
      label: asg.label,
      options: people.map((p) => ({ value: p, label: p })),
      noneLabel: people.length ? 'Nobody' : undefined,
      placeholder: 'Name',
      apply: (r, v) => jsonRequest(url(r), 'PATCH', Object.fromEntries(asg.fields.map((f) => [f, v || null]))),
    } : undefined,
    due: due && tool.edit.includes(due.field) ? {
      label: due.label,
      apply: (r, ymd) => jsonRequest(url(r), 'PATCH', { [due.field]: ymd }),
    } : undefined,
    remove: o.deleteUrl ? {
      allowed: !!o.canDelete,
      apply: (r) => jsonRequest(o.deleteUrl!(r), 'DELETE'),
    } : undefined,
    onDone: o.onDone,
  };
}
