/**
 * A sub's next invoice, drafted in the portal before it is sent.
 *
 * The lines carry over from the last invoice: same descriptions and scheduled
 * values, and what was billed to date becomes "previous". The sub only types
 * what they did this period. Totals here are a preview in exact cents; the
 * server (computePayApp) is the one that files the numbers.
 */

export interface DraftLine { key: string; description: string; scheduled: string; previous: string; thisPeriod: string }

const cents = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
let seq = 0;
const key = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export function blankLine(): DraftLine {
  return { key: key(), description: '', scheduled: '', previous: '0', thisPeriod: '' };
}

/** Lines for the next invoice from the last one's (prev_completed/total_completed are dollars). */
export function linesFromLast(last: ReadonlyArray<Record<string, unknown>> | null | undefined): DraftLine[] {
  const rows = (last || []).filter((l) => String(l.description ?? '').trim());
  if (!rows.length) return [blankLine()];
  return rows.map((l) => ({
    key: key(),
    description: String(l.description ?? ''),
    scheduled: String(Number(l.scheduled_value ?? 0) || ''),
    previous: String(Number(l.total_completed ?? 0) || 0),
    thisPeriod: '',
  }));
}

export interface DraftTotals { requested: number; retainage: number; net: number; problems: string[] }

/** Preview of what the invoice asks for (dollars), and what is wrong with it, in plain words. */
export function draftTotals(lines: DraftLine[], retainagePct: string | number): DraftTotals {
  const problems: string[] = [];
  const pct = Number(retainagePct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) problems.push('Retainage must be between 0 and 100%.');
  let thisC = 0, toDateC = 0;
  const used = lines.filter((l) => l.description.trim() || cents(l.thisPeriod) || cents(l.scheduled));
  if (!used.length) problems.push('Add at least one line.');
  used.forEach((l, i) => {
    const n = i + 1;
    if (!l.description.trim()) problems.push(`Line ${n} needs a description.`);
    const sched = cents(l.scheduled), prev = cents(l.previous), now = cents(l.thisPeriod);
    if (now < 0 || prev < 0 || sched < 0) problems.push(`Line ${n} can't be negative.`);
    if (sched > 0 && prev + now > sched) problems.push(`Line ${n} bills past its scheduled value.`);
    thisC += now; toDateC += prev + now;
  });
  if (used.length && thisC <= 0) problems.push('Enter what you billed this period on at least one line.');
  const ret = Math.round((toDateC * (Number.isFinite(pct) ? pct : 0)) / 100);
  return { requested: thisC / 100, retainage: ret / 100, net: (thisC - Math.round((thisC * (Number.isFinite(pct) ? pct : 0)) / 100)) / 100, problems };
}

/** The body POST /api/portal/sub/pay-apps takes. */
export function invoiceBody(lines: DraftLine[], periodFrom: string, periodTo: string, retainagePct: string | number) {
  const pct = Number(retainagePct);
  const prevC = lines.filter((l) => l.description.trim()).reduce((s, l) => s + cents(l.previous), 0);
  return {
    period_start: periodFrom || null,
    period_end: periodTo,
    retainage_percent: pct,
    // What was already billed, less its retainage — so the server's net due is
    // this period's work less retainage, not everything to date again.
    previous_payments_less_retainage: (prevC - Math.round((prevC * pct) / 100)) / 100,
    line_items: lines
      .filter((l) => l.description.trim())
      .map((l) => ({ description: l.description.trim(), scheduled_value: cents(l.scheduled) / 100, previous_completed: cents(l.previous) / 100, this_period: cents(l.thisPeriod) / 100 })),
  };
}
