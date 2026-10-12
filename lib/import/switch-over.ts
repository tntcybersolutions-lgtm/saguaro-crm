/**
 * Switch-over import — bring jobs, customers and leads over from another app.
 *
 * A builder leaving Buildertrend, JobTread, CoConstruct (or a spreadsheet)
 * exports a CSV / Excel file; this reads it, matches its columns to ours by
 * the names those apps use, and turns each row into the same request body the
 * app's own create screens send (/api/projects/create, /api/customers/profiles,
 * /api/leads) — so an imported job gets its folders, directory and activity
 * exactly like one made by hand. Pure functions: tested in switch-over.sanity.test.ts.
 */

import { stateFromAddress } from '../us-state';

export type ImportKind = 'jobs' | 'customers' | 'leads';

export interface TargetField {
  key: string;
  label: string;
  required?: boolean;
  /** Lower-cased header names this field is known by in other apps' exports. */
  aliases: string[];
}

export const IMPORT_FIELDS: Record<ImportKind, TargetField[]> = {
  jobs: [
    { key: 'name', label: 'Job name', required: true, aliases: ['job name', 'job', 'project name', 'project', 'name', 'job title', 'title'] },
    { key: 'projectNumber', label: 'Job number', aliases: ['job number', 'job #', 'job no', 'project number', 'project #', 'number', 'job id'] },
    { key: 'address', label: 'Address', aliases: ['address', 'street address', 'job address', 'site address', 'street', 'address 1', 'location'] },
    { key: 'city', label: 'City', aliases: ['city', 'job city'] },
    { key: 'state', label: 'State', aliases: ['state', 'job state', 'st'] },
    { key: 'zip', label: 'ZIP', aliases: ['zip', 'zip code', 'postal code', 'job zip'] },
    { key: 'status', label: 'Status', aliases: ['status', 'job status', 'project status', 'stage'] },
    { key: 'contractValue', label: 'Contract amount', aliases: ['contract price', 'contract amount', 'contract value', 'contract', 'job price', 'price', 'revenue', 'estimated revenue', 'total price', 'value'] },
    { key: 'startDate', label: 'Start date', aliases: ['start date', 'projected start', 'actual start', 'start', 'job start'] },
    { key: 'ownerName', label: 'Owner / client name', aliases: ['customer', 'customer name', 'client', 'client name', 'owner', 'owner name', 'homeowner', 'contact', 'contact name'] },
    { key: 'ownerEmail', label: 'Owner email', aliases: ['customer email', 'client email', 'owner email', 'email', 'contact email'] },
    { key: 'description', label: 'Notes', aliases: ['notes', 'description', 'job notes', 'scope'] },
  ],
  customers: [
    { key: 'name', label: 'Name', required: true, aliases: ['name', 'customer', 'customer name', 'client', 'client name', 'full name', 'contact', 'contact name', 'display name'] },
    { key: 'email', label: 'Email', aliases: ['email', 'email address', 'customer email', 'primary email'] },
    { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'cell', 'cell phone', 'mobile', 'primary phone'] },
    { key: 'city', label: 'City', aliases: ['city'] },
    { key: 'state', label: 'State', aliases: ['state', 'st'] },
    { key: 'zip_code', label: 'ZIP', aliases: ['zip', 'zip code', 'postal code'] },
    { key: 'source', label: 'Source', aliases: ['source', 'lead source', 'referral source'] },
  ],
  leads: [
    { key: 'contact_name', label: 'Contact name', required: true, aliases: ['contact', 'contact name', 'name', 'customer', 'customer name', 'client', 'lead name', 'opportunity', 'opportunity name', 'title'] },
    { key: 'company_name', label: 'Company', aliases: ['company', 'company name', 'organization', 'business'] },
    { key: 'email', label: 'Email', aliases: ['email', 'email address', 'contact email'] },
    { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'cell', 'mobile', 'contact phone'] },
    { key: 'stage', label: 'Stage', aliases: ['stage', 'status', 'lead status', 'pipeline stage'] },
    { key: 'source', label: 'Source', aliases: ['source', 'lead source', 'referral source'] },
    { key: 'estimated_value', label: 'Estimated value', aliases: ['estimated value', 'value', 'estimated revenue', 'budget', 'amount', 'projected revenue', 'est. revenue'] },
    { key: 'project_type', label: 'Project type', aliases: ['project type', 'job type', 'type', 'work type'] },
    { key: 'location', label: 'Location', aliases: ['address', 'location', 'street address', 'job address'] },
    { key: 'notes', label: 'Notes', aliases: ['notes', 'description', 'comments'] },
  ],
};

/** RFC-4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, ''); // Excel's byte-order mark
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop fully blank lines (trailing newline, spacer rows).
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const norm = (h: string) => h.toLowerCase().replace(/[_\-]+/g, ' ').replace(/[^a-z0-9#. ]/g, '').replace(/\s+/g, ' ').trim();

/** Which column (index, or -1) feeds each of our fields. Exact alias first, then "starts with". */
export function autoMap(headers: string[], kind: ImportKind): Record<string, number> {
  const h = headers.map(norm);
  const used = new Set<number>();
  const map: Record<string, number> = {};
  for (const f of IMPORT_FIELDS[kind]) {
    let idx = h.findIndex((x, i) => !used.has(i) && f.aliases.includes(x));
    if (idx < 0) idx = h.findIndex((x, i) => !used.has(i) && f.aliases.some((a) => a.length > 3 && x.startsWith(a)));
    map[f.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return map;
}

/** "$1,234.50" / "(250)" / "1234" → number; '' / junk → null. */
export function parseMoney(v: string): number | null {
  const t = (v || '').trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-');
  const n = Number(t.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || t.replace(/[^0-9]/g, '') === '') return null;
  return neg ? -n : n;
}

/** "3/7/2026", "03/07/26", "2026-03-07", "Mar 7, 2026" → "2026-03-07"; otherwise null. */
export function parseDate(v: string): string | null {
  const t = (v || '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime()) && /[a-z]/i.test(t)) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

/** Other apps' job statuses → ours ('active' | 'completed'). */
export function jobStatus(v: string): string {
  const t = (v || '').trim().toLowerCase();
  if (/(closed|complete|finished|done|archived|warranty)/.test(t)) return 'completed';
  return 'active';
}

/**
 * Which phase an imported job lands in. A job list exported from another app
 * is mostly sold work — it lands "building" (contract, schedule, field tools
 * lead) unless its status says it is still being chased.
 */
export function jobPhase(v: string): 'bidding' | 'building' {
  const t = (v || '').trim().toLowerCase();
  return /(bid|estimat|pre-?sale|proposal|lead|prospect|quot|opportunit)/.test(t) ? 'bidding' : 'building';
}

/** One spreadsheet row → the body the app's own create route takes. null = skip (no required value). */
export function rowToBody(kind: ImportKind, row: string[], map: Record<string, number>): Record<string, unknown> | null {
  const get = (k: string) => (map[k] >= 0 ? String(row[map[k]] ?? '').trim() : '');
  if (kind === 'jobs') {
    const name = get('name');
    if (!name) return null;
    const street = get('address');
    const address = [street, get('city'), [get('state'), get('zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const body: Record<string, unknown> = { name, status: jobStatus(get('status')), phase: jobPhase(get('status')) };
    if (address) body.address = address;
    // The job's state sets its lien-waiver and wage rules — never leave a
    // Texas job on the create route's Arizona default.
    const jurisdiction = stateFromAddress(get('state')) || stateFromAddress(address);
    if (jurisdiction) body.stateJurisdiction = jurisdiction;
    if (get('projectNumber')) body.projectNumber = get('projectNumber');
    const value = parseMoney(get('contractValue'));
    if (value !== null) body.contractValue = value;
    const start = parseDate(get('startDate'));
    if (start) body.startDate = start;
    if (get('ownerName')) body.ownerName = get('ownerName');
    if (get('ownerEmail')) body.ownerEmail = get('ownerEmail');
    if (get('description')) body.description = get('description');
    return body;
  }
  if (kind === 'customers') {
    const name = get('name');
    const email = get('email');
    if (!name && !email) return null;
    const body: Record<string, unknown> = { name: name || email, status: 'customer', source: get('source') || 'Import' };
    for (const k of ['email', 'phone', 'city', 'state', 'zip_code']) if (get(k)) body[k] = get(k);
    return body;
  }
  const contact = get('contact_name') || get('company_name');
  if (!contact) return null;
  const body: Record<string, unknown> = { contact_name: contact, source: get('source') || 'Import' };
  for (const k of ['company_name', 'email', 'phone', 'stage', 'project_type', 'location', 'notes']) if (get(k)) body[k] = get(k);
  const value = parseMoney(get('estimated_value'));
  if (value !== null) body.estimated_value = value;
  return body;
}

/** The name a row is matched on to skip what is already in Saguaro. */
export function dedupeKey(kind: ImportKind, body: Record<string, unknown>): string {
  const v = kind === 'jobs' ? body.name : kind === 'customers' ? (body.email || body.name) : (body.email || body.contact_name);
  return String(v ?? '').trim().toLowerCase();
}

export const IMPORT_ENDPOINT: Record<ImportKind, string> = {
  jobs: '/api/projects/create',
  customers: '/api/customers/profiles',
  leads: '/api/leads',
};

/** The most rows one import sends — a big file goes in batches the user can see. */
export const IMPORT_MAX_ROWS = 1000;
