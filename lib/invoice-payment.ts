/**
 * lib/invoice-payment.ts — what "paid" means on an invoice, written one way.
 *
 * Recording a payment on an invoice is setting its status to Paid (the
 * invoice's Edit sheet). That wrote status = 'paid' and nothing else:
 * paid_at and paid_amount stayed empty, so the invoice's Payment section never
 * appeared, nothing could say WHEN the money came in, and a part payment could
 * not be told from a full one. Both invoice write routes run their update
 * through stampPayment:
 *
 *   - moving INTO paid stamps paid_at (now, unless one was sent) and
 *     paid_amount (the invoice total, unless one was sent);
 *   - moving OUT of paid (a payment entered by mistake) clears them, unless
 *     the caller sent its own values.
 *
 * Pure — tested in invoice-payment.sanity.test.ts.
 */
export type InvoiceMoneyRow = {
  status?: string | null;
  amount?: unknown;
  tax?: unknown;
  total?: unknown;
  paid_at?: string | null;
  paid_amount?: unknown;
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** The invoice's total: stored total when non-zero, else amount + tax. */
export function invoiceTotal(row: InvoiceMoneyRow | null | undefined): number {
  if (!row) return 0;
  const t = num(row.total);
  return t !== 0 ? t : Math.round((num(row.amount) + num(row.tax)) * 100) / 100;
}

/**
 * Add the payment fields a status change implies to `updates` (mutated and
 * returned). `current` is the row before the write.
 */
export function stampPayment(
  updates: Record<string, unknown>,
  current: InvoiceMoneyRow | null | undefined,
  now: Date = new Date(),
): Record<string, unknown> {
  if (updates.status === undefined || updates.status === null) return updates;
  const next = String(updates.status).toLowerCase();
  const was = String(current?.status ?? '').toLowerCase();
  if (next === 'paid' && was !== 'paid') {
    if (updates.paid_at === undefined || updates.paid_at === null || updates.paid_at === '') {
      updates.paid_at = now.toISOString();
    }
    if (updates.paid_amount === undefined || updates.paid_amount === null || updates.paid_amount === '') {
      // The total as it will stand after this write (amount / tax may be in it).
      const merged: InvoiceMoneyRow = { ...current, ...updates } as InvoiceMoneyRow;
      updates.paid_amount = updates.total !== undefined ? num(updates.total) : invoiceTotal(merged);
    }
  } else if (next !== 'paid' && was === 'paid') {
    if (updates.paid_at === undefined) updates.paid_at = null;
    if (updates.paid_amount === undefined) updates.paid_amount = null;
  }
  return updates;
}
