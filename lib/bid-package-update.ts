/**
 * lib/bid-package-update.ts — what PATCH /api/bid-packages/[id] may write.
 *
 * Each field is checked against its column's type before it is written, so a
 * wrong value is a 400 that names the field instead of a database 500. Kept out
 * of the route file because a Next.js route may only export its handlers.
 */

import { coverageValue } from './jacket-insurance';

const TEXT = [
  'name', 'trade', 'description', 'scope_of_work', 'scope_summary', 'scope_narrative', 'notes',
  'bid_instructions', 'insurance_requirements', 'status', 'pre_bid_meeting_location',
] as const;
const DAY = ['due_date', 'pre_bid_date'] as const;
const BOOL = ['is_public_project', 'requires_bond', 'requires_prevailing_wage'] as const;
const LIST = ['csi_codes', 'work_included', 'work_excluded'] as const;
/** general_liability / auto_liability / workers_compensation are TEXT. */
const COVERAGE = ['general_liability', 'auto_liability', 'workers_compensation'] as const;

type Bad = { field: string; why: string };

/** Body → columns. Returns the update, or the first field that is wrong. */
export function packageUpdate(body: Record<string, unknown>): { fields: Record<string, unknown> } | { bad: Bad } {
  const fields: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;

  for (const k of TEXT) {
    if (!has(k)) continue;
    const v = body[k];
    if (v !== null && typeof v !== 'string') return { bad: { field: k, why: 'must be text' } };
    const t = typeof v === 'string' ? v.trim() : '';
    if (k === 'name' && !t) return { bad: { field: k, why: 'cannot be blank' } };
    fields[k] = t || null;
  }
  for (const k of DAY) {
    if (!has(k)) continue;
    const v = body[k];
    if (v === null || v === '') { fields[k] = null; continue; }
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T12:00:00Z`).getTime())) {
      return { bad: { field: k, why: 'must be a date (YYYY-MM-DD)' } };
    }
    fields[k] = v;
  }
  if (has('bid_due_date')) {
    const v = body.bid_due_date;
    if (v === null || v === '') fields.bid_due_date = null;
    else if (typeof v !== 'string' || Number.isNaN(new Date(v).getTime())) return { bad: { field: 'bid_due_date', why: 'must be a date' } };
    else fields.bid_due_date = v;
  }
  for (const k of BOOL) {
    if (!has(k)) continue;
    if (typeof body[k] !== 'boolean') return { bad: { field: k, why: 'must be true or false' } };
    fields[k] = body[k];
  }
  for (const k of LIST) {
    if (!has(k)) continue;
    const v = body[k];
    const arr = v === null ? [] : typeof v === 'string' ? v.split(/\r?\n/) : Array.isArray(v) ? v : null;
    if (!arr || arr.some((x) => typeof x !== 'string')) return { bad: { field: k, why: 'must be a list of text lines' } };
    const clean = (arr as string[]).map((x) => x.replace(/^\s*[•*-]\s*/, '').trim()).filter(Boolean);
    fields[k] = clean.length ? clean : null;
  }
  for (const k of COVERAGE) {
    if (!has(k)) continue;
    const v = body[k];
    if (v !== null && typeof v !== 'string' && typeof v !== 'number') return { bad: { field: k, why: 'must be an amount or a term such as Statutory' } };
    const c = coverageValue(v);
    fields[k] = c == null ? null : String(c);
  }
  for (const k of ['budget_estimate', 'insurance_required_amount'] as const) {
    if (!has(k)) continue;
    const v = body[k];
    if (v === null || v === '') { fields[k] = null; continue; }
    /* "$5,000,000", "5M" and 5000000 all mean the same figure. */
    let n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN;
    if (!Number.isFinite(n) && typeof v === 'string') {
      const c = coverageValue(v);
      n = typeof c === 'number' ? c : NaN;
    }
    if (!Number.isFinite(n) || n < 0 || (k === 'insurance_required_amount' && n > 2_147_483_647)) {
      return { bad: { field: k, why: 'must be an amount' } };
    }
    fields[k] = k === 'insurance_required_amount' ? Math.round(n) : n;
  }
  return { fields };
}

