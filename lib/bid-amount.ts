/**
 * The dollar figure of one bid_submissions row.
 *
 * The table carries the price in three columns — base_amount (what both bid
 * portals write), amount (defaults to 0, not null) and base_bid (older imports)
 * — and readers coalesced them in different orders. `amount ?? base_amount`
 * never falls through, because ?? only skips null and 0 is not null: an award
 * read that way went out at $0. The first POSITIVE figure in base_amount →
 * amount → base_bid is the bid. Pure.
 */
export function bidAmount(row: { base_amount?: unknown; amount?: unknown; base_bid?: unknown } | null | undefined): number {
  for (const v of [row?.base_amount, row?.amount, row?.base_bid]) {
    const n = Number(v);
    if (v != null && v !== '' && Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
