/**
 * Invoice direction — who pays whom on a row of public.invoices.
 *
 * The invoices table holds owner billing (receivable: the owner pays the
 * company) and, from before the bills table existed, vendor / sub bills
 * (payable: the company pays them). Migration 20261012a tagged every row.
 * Every screen and rollup that reads invoices as money owed TO the company —
 * Invoicing, a job's Invoices, collected / outstanding, overdue reminders,
 * QuickBooks invoice push, the owner portal — reads receivable rows only.
 *
 *   receivableOnly(db.from('invoices').select('*').eq('tenant_id', t))
 *   rows.filter(isReceivable)
 */

type Filterable<Q> = { eq(column: string, value: unknown): Q };

/** Narrow an `invoices` query to owner billing. */
export function receivableOnly<Q extends Filterable<Q>>(q: Q): Q {
  return q.eq('direction', 'receivable');
}

/** Narrow an `invoices` query to vendor / sub bills — a cost, never revenue. */
export function payableOnly<Q extends Filterable<Q>>(q: Q): Q {
  return q.eq('direction', 'payable');
}

/** The same rule for rows in hand. A row read without the column counts as
 *  owner billing (the column's default), so select `direction` to filter. */
export function isReceivable(r: { direction?: string | null } | null | undefined): boolean {
  if (!r) return false;
  return String(r.direction ?? 'receivable').toLowerCase() !== 'payable';
}
