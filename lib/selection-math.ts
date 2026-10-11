/**
 * lib/selection-math.ts — selection prices against allowances. Pure, so the
 * portal, the GC routes and the sanity test share one definition
 * (lib/selection-pick records the choice itself).
 */
export type OptionRow = {
  id: string;
  selection_id: string | null;
  name: string;
  description?: string | null;
  manufacturer?: string | null;
  model_number?: string | null;
  color?: string | null;
  finish?: string | null;
  unit_cost?: unknown;
  quantity?: unknown;
  total_cost?: unknown;
  image_url?: string | null;
  spec_url?: string | null;
  is_recommended?: boolean | null;
  sort_order?: number | null;
};

/** What the option costs the owner: its total, else unit × quantity, else the unit price. Pure. */
export function optionPrice(o: Pick<OptionRow, 'unit_cost' | 'quantity' | 'total_cost'>): number {
  const total = Number(o.total_cost);
  if (total > 0) return total;
  const unit = Number(o.unit_cost) || 0;
  const qty = Number(o.quantity);
  return qty > 0 ? unit * qty : unit;
}

/** Positive = over the allowance by that much; negative = under. Cents-rounded. Pure. */
export function overAllowance(allowance: unknown, price: number): number {
  return Math.round((price - (Number(allowance) || 0)) * 100) / 100;
}

/** Allowances offered, chosen so far, and the running balance (+ = under, − = over). Pure. */
export function allowanceBalance(rows: Array<{ allowance?: unknown; selected_amount?: unknown; status?: string | null }>) {
  let allowances = 0, chosen = 0, chosenAllowance = 0;
  for (const r of rows) {
    const a = Number(r.allowance) || 0;
    allowances += a;
    if (String(r.status || 'pending').toLowerCase() !== 'pending') {
      chosen += Number(r.selected_amount) || 0;
      chosenAllowance += a;
    }
  }
  const cents = (n: number) => Math.round(n * 100) / 100;
  return { allowances: cents(allowances), chosen: cents(chosen), balance: cents(chosenAllowance - chosen) };
}

