/**
 * lib/change-order-amount.ts — the dollar value of a change order, read one way
 * everywhere.
 *
 * Change orders carry two money columns: `cost_impact` (TEXT — the CO register,
 * Edit Amount, selections overages) and `amount` (NUMERIC — the older create
 * routes and imports). Rows written by one path leave the other at 0 or null,
 * so a screen that read only `cost_impact` showed $0 on COs whose value sat in
 * `amount` while the job summary (which read both) showed the real total.
 * `cost_impact ?? amount` is not enough either: a stored "0" is not null.
 *
 * Rule: cost_impact when it is a non-zero number, else amount, else 0. Pure.
 */
export type CoMoney = { cost_impact?: unknown; amount?: unknown } | null | undefined;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function coAmount(c: CoMoney): number {
  if (!c) return 0;
  return num(c.cost_impact) || num(c.amount) || 0;
}

/** Sum of coAmount over a list. Pure. */
export function coTotal(list: CoMoney[] | null | undefined): number {
  return (list || []).reduce((s, c) => s + coAmount(c), 0);
}
