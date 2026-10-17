/** AIA G702/G703 progress-billing math. Deterministic, integer-cents. */
import type { PayAppInput, PayAppResult, G703Row } from './types';

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** Compute the full pay application (G703 rows + G702 summary) from an SOV + this period's progress. */
export function computePayApp(input: PayAppInput): PayAppResult {
  const retPct = Math.max(0, input.retainagePct || 0);
  const storedRetPct = input.storedRetainagePct != null ? Math.max(0, input.storedRetainagePct) : retPct;

  const rows: G703Row[] = input.lines.map((l) => {
    const workInPlace = l.fromPreviousCents + l.thisPeriodCents;                 // D + E
    const totalCompletedStored = workInPlace + l.storedCents;                    // G = D + E + F
    // retainage held on work in place and (optionally at its own %) on stored materials
    const retainageCents = Math.round((workInPlace * retPct) / 100) + Math.round((l.storedCents * storedRetPct) / 100);
    return {
      ...l,
      totalCompletedStoredCents: totalCompletedStored,
      percentComplete: pct(totalCompletedStored, l.scheduledValueCents),
      retainageCents,
      balanceToFinishCents: l.scheduledValueCents - totalCompletedStored,
    };
  });

  const totalCompletedStoredCents = rows.reduce((s, r) => s + r.totalCompletedStoredCents, 0);
  const retainageCents = rows.reduce((s, r) => s + r.retainageCents, 0);
  const contractSumToDateCents = input.contractSumCents + input.changeOrdersCents;         // line 3
  const totalEarnedLessRetainageCents = totalCompletedStoredCents - retainageCents;         // line 6
  const currentPaymentDueCents = totalEarnedLessRetainageCents - input.previousCertificatesCents; // line 8
  const balanceToFinishCents = contractSumToDateCents - totalEarnedLessRetainageCents;      // line 9

  return {
    rows,
    originalContractCents: input.contractSumCents,
    changeOrdersCents: input.changeOrdersCents,
    contractSumToDateCents,
    totalCompletedStoredCents,
    retainageCents,
    totalEarnedLessRetainageCents,
    previousCertificatesCents: input.previousCertificatesCents,
    currentPaymentDueCents,
    balanceToFinishCents,
    percentComplete: pct(totalCompletedStoredCents, contractSumToDateCents),
  };
}

/** Display only. The sign leads the dollar sign (-$2,150.00, never $-2,150.00),
 *  and the grouping is US whatever the browser's locale. */
export const usd = (cents: number) => (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
