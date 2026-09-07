/**
 * lib/estimate-bid.ts
 *
 * Cost to bid price, and whether the bid is ready to send.
 *
 * Every estimator does this last and in a spreadsheet: take the direct cost,
 * add contingency, add overhead, add profit, add bond, and see what number
 * falls out. Buildern gives you one markup field. Procore gives you a workbook.
 * Neither shows the whole waterfall, and neither of them gets the bond right.
 *
 * THE BOND IS CIRCULAR AND ALMOST EVERYONE GETS IT WRONG. A surety's premium is
 * a percentage of the CONTRACT amount, and the contract amount includes the
 * premium. Applying the rate to the pre-bond subtotal — which is what a
 * spreadsheet does unless someone thought about it — under-collects, by about
 * 1% of the premium for every 1% of bond rate. On a $4M job at 1.5% that is a
 * few thousand dollars of your own money paid to your surety. Solved properly
 * here: subtotal ÷ (1 − rate), the same arithmetic as margin.
 *
 * READINESS is the other half, and nobody ships it. An estimate can total
 * correctly and still be unsendable: a division in the budget with no lines
 * against it, a quantity with no price, forty lines still sitting on library
 * costs, allowances nobody has pinned down. Those are all findable, and finding
 * them ten minutes before a bid is due is worth more than any number on the
 * screen.
 */

import type { GridRow } from './estimate-grid';
import { lineTotals } from './estimate-grid';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ── the waterfall ───────────────────────────────────────────────────────── */

export interface BidInputs {
  /** Design/scope allowance, applied to direct cost. */
  contingencyPct?: number;
  /** Price movement between bid and buyout, applied to direct cost. */
  escalationPct?: number;
  /** General conditions and home office, applied after contingency. */
  overheadPct?: number;
  /** Fee. See `profitMode` — the two readings differ by real money. */
  profitPct?: number;
  /**
   * 'markup' adds the percentage to cost. 'margin' makes it that share of the
   * bid price. 20% markup on $100 is $120; 20% margin is $125.
   */
  profitMode?: 'markup' | 'margin';
  /** Surety premium as a share of the FINAL contract, not of the subtotal. */
  bondPct?: number;
  /** Builder's risk and liability, applied to the pre-bond subtotal. */
  insurancePct?: number;
}

export interface BidStep {
  key: string;
  label: string;
  /** What this step added. Zero for the opening cost line. */
  amount: number;
  /** Running total after this step. */
  runningTotal: number;
  /** The rate that produced it, for the readout. */
  pct?: number;
  note?: string;
}

export interface BidResult {
  steps: BidStep[];
  directCost: number;
  bidPrice: number;
  /** Everything above direct cost. */
  totalAddOns: number;
  /** Profit as a share of the bid price — the number that is actually yours. */
  realisedMarginPct: number | null;
  /** Bid price ÷ direct cost. */
  multiplier: number | null;
}

const DEFAULTS: Required<BidInputs> = {
  contingencyPct: 0, escalationPct: 0, overheadPct: 0,
  profitPct: 0, profitMode: 'markup', bondPct: 0, insurancePct: 0,
};

/**
 * Build the bid price from direct cost.
 *
 * Order is not arbitrary. Contingency and escalation adjust the COST, so
 * overhead and profit are earned on them. Bond is last because it is a share of
 * the finished number.
 */
export function bidWaterfall(directCost: number, inputs: BidInputs = {}): BidResult {
  const i = { ...DEFAULTS, ...inputs };
  const cost = round2(num(directCost));
  const steps: BidStep[] = [];
  let running = cost;

  steps.push({ key: 'cost', label: 'Direct cost', amount: 0, runningTotal: cost, note: 'Material, labor, equipment and subcontract from the estimate lines' });

  const add = (key: string, label: string, amount: number, pct: number, note?: string) => {
    if (!amount) return;
    running = round2(running + amount);
    steps.push({ key, label, amount: round2(amount), runningTotal: running, pct, note });
  };

  /* Contingency and escalation adjust the cost itself, so everything after
     earns on them. Adding them at the end instead is a quiet way to work for
     free on the part of the job you were least sure about. */
  add('contingency', 'Contingency', cost * (i.contingencyPct / 100), i.contingencyPct,
    'On direct cost — overhead and profit are earned on it too');
  add('escalation', 'Escalation', cost * (i.escalationPct / 100), i.escalationPct,
    'Price movement between bid and buyout');

  const adjustedCost = running;
  add('overhead', 'Overhead', adjustedCost * (i.overheadPct / 100), i.overheadPct,
    'General conditions and home office');

  const preProfit = running;
  if (i.profitPct) {
    if (i.profitMode === 'margin') {
      if (i.profitPct >= 100) {
        throw new Error('Profit margin must be under 100% — at 100% the bid price is unbounded.');
      }
      add('profit', 'Profit', preProfit / (1 - i.profitPct / 100) - preProfit, i.profitPct,
        `${i.profitPct}% MARGIN — this share of the bid price, not of cost`);
    } else {
      add('profit', 'Profit', preProfit * (i.profitPct / 100), i.profitPct,
        `${i.profitPct}% MARKUP on cost — the realised margin is lower`);
    }
  }

  add('insurance', 'Insurance', running * (i.insurancePct / 100), i.insurancePct,
    "Builder's risk and liability");

  /* The circular one. A premium of b% of the FINAL contract means
     final = subtotal / (1 − b/100). Applying b% to the subtotal instead
     under-collects, and you make up the difference out of your fee. */
  if (i.bondPct) {
    if (i.bondPct >= 100) throw new Error('Bond rate must be under 100%.');
    const preBond = running;
    const withBond = preBond / (1 - i.bondPct / 100);
    add('bond', 'Bond premium', withBond - preBond, i.bondPct,
      'A share of the FINAL contract, so it is grossed up — applying the rate to the subtotal under-collects');
  }

  const bidPrice = running;
  const profitStep = steps.find((s) => s.key === 'profit');
  return {
    steps,
    directCost: cost,
    bidPrice,
    totalAddOns: round2(bidPrice - cost),
    realisedMarginPct: bidPrice > 0 && profitStep ? Math.round((profitStep.amount / bidPrice) * 1000) / 10 : null,
    multiplier: cost > 0 ? Math.round((bidPrice / cost) * 1000) / 1000 : null,
  };
}

/**
 * The bond rate that a given all-in price implies, for checking a number a
 * client or a competitor has quoted.
 */
export function impliedMultiplier(directCost: number, bidPrice: number): number | null {
  if (directCost <= 0) return null;
  return Math.round((bidPrice / directCost) * 1000) / 1000;
}

/* ── cost distribution ───────────────────────────────────────────────────── */

export interface BucketSplit {
  material: number; labor: number; equipment: number; sub: number; total: number;
  materialPct: number; laborPct: number; equipmentPct: number; subPct: number;
}

/**
 * Where the money is, by cost type.
 *
 * The split is a sanity check in itself: a fit-out that comes back 80% material
 * and 8% labor has a labor rate missing somewhere, and that is far easier to
 * see as a proportion than as a column of numbers.
 */
export function bucketSplit(rows: GridRow[]): BucketSplit {
  let material = 0, labor = 0, equipment = 0, sub = 0;
  for (const r of rows) {
    const t = lineTotals(r);
    material += t.material; labor += t.labor; equipment += t.equipment; sub += t.sub;
  }
  const total = round2(material + labor + equipment + sub);
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    material: round2(material), labor: round2(labor), equipment: round2(equipment), sub: round2(sub),
    total,
    materialPct: pct(material), laborPct: pct(labor), equipmentPct: pct(equipment), subPct: pct(sub),
  };
}

/* ── readiness ───────────────────────────────────────────────────────────── */

export type FindingSeverity = 'blocker' | 'warn' | 'note';

export interface BidFinding {
  severity: FindingSeverity;
  title: string;
  detail: string;
  /** How much money the finding touches, where that is meaningful. */
  amount?: number;
  count?: number;
  /** Row indexes the finding refers to, for highlighting. */
  rows?: number[];
}

export interface ReadinessReport {
  findings: BidFinding[];
  blockers: number;
  warnings: number;
  /** 0-100. Not a grade — a measure of how much is still unresolved. */
  score: number;
  pricedLines: number;
  totalLines: number;
}

/**
 * What is still wrong with this estimate.
 *
 * Ordered by what would cost the most to discover late. A quantity with no
 * price is a hole in the number; a line with no cost code is only untidy.
 *
 * The score is deliberately not a grade. It is the share of the estimate's
 * value that nothing is flagged against, so 100 means every line is priced,
 * coded and yours — not that the bid is right.
 */
export function assessReadiness(
  rows: GridRow[],
  opts: { budgetDivisions?: string[]; assemblyPricedIds?: string[] } = {},
): ReadinessReport {
  const findings: BidFinding[] = [];
  const totalValue = rows.reduce((s, r) => s + lineTotals(r).total, 0);
  let unresolvedValue = 0;

  const idx = (pred: (r: GridRow) => boolean) =>
    rows.map((r, i) => (pred(r) ? i : -1)).filter((i) => i >= 0);

  /* ── blockers: the estimate is not a number yet ───────────────────────── */

  const noPrice = idx((r) => !r.is_excluded && num(r.quantity) > 0 && lineTotals(r).total === 0);
  if (noPrice.length) {
    findings.push({
      severity: 'blocker',
      title: `${noPrice.length} line${noPrice.length === 1 ? ' has' : 's have'} a quantity but no price`,
      detail: 'A quantity with nothing against it contributes zero to the bid. These are holes in the number, not free scope.',
      count: noPrice.length, rows: noPrice,
    });
  }

  const noQty = idx((r) => !r.is_excluded && num(r.quantity) === 0 && (
    num(r.unit_material_cost) + num(r.unit_labor_cost) + num(r.unit_equipment_cost) + num(r.unit_sub_cost)) > 0);
  if (noQty.length) {
    findings.push({
      severity: 'blocker',
      title: `${noQty.length} line${noQty.length === 1 ? ' is' : 's are'} priced but have no quantity`,
      detail: 'A unit cost with no quantity prices nothing. Either the take-off is missing or the line should go.',
      count: noQty.length, rows: noQty,
    });
  }

  const blank = idx((r) => !String(r.description ?? '').trim());
  if (blank.length) {
    findings.push({
      severity: 'blocker',
      title: `${blank.length} line${blank.length === 1 ? ' has' : 's have'} no description`,
      detail: 'Nobody can buy out, subcontract or defend a line with no name on it.',
      count: blank.length, rows: blank,
    });
  }

  /* ── warnings: real money still unresolved ────────────────────────────── */

  const allowanceRows = idx((r) => !!r.is_allowance && !r.is_excluded);
  if (allowanceRows.length) {
    const amount = round2(allowanceRows.reduce((s, i) => s + lineTotals(rows[i]).total, 0));
    unresolvedValue += amount;
    findings.push({
      severity: 'warn',
      title: `${allowanceRows.length} allowance${allowanceRows.length === 1 ? '' : 's'} carrying ${money(amount)}`,
      detail: 'An allowance is a number nobody has committed to. It will move, and the difference lands on a change order.',
      amount, count: allowanceRows.length, rows: allowanceRows,
    });
  }

  const libraryPriced = idx((r) => !!r.assembly_id && !r.is_excluded);
  if (libraryPriced.length) {
    const amount = round2(libraryPriced.reduce((s, i) => s + lineTotals(rows[i]).total, 0));
    unresolvedValue += amount;
    findings.push({
      severity: 'warn',
      title: `${libraryPriced.length} line${libraryPriced.length === 1 ? '' : 's'} still on library pricing — ${money(amount)}`,
      detail: 'The quantities are standards-based and worth trusting. The unit costs are ours, not your suppliers’. Price them before this goes out.',
      amount, count: libraryPriced.length, rows: libraryPriced,
    });
  }

  /* Suspiciously round money. A cost of exactly 1,000 or 25,000 in a unit-cost
     column is almost always a placeholder somebody meant to come back to. */
  const roundish = idx((r) => {
    if (r.is_excluded) return false;
    const vals = [r.unit_material_cost, r.unit_labor_cost, r.unit_equipment_cost, r.unit_sub_cost].map(num).filter((v) => v >= 1000);
    return vals.some((v) => v % 1000 === 0);
  });
  if (roundish.length) {
    findings.push({
      severity: 'warn',
      title: `${roundish.length} unit cost${roundish.length === 1 ? ' looks' : 's look'} like a placeholder`,
      detail: 'Exact thousands in a unit-cost column are usually a number somebody meant to come back to.',
      count: roundish.length, rows: roundish,
    });
  }

  const budgetDivs = opts.budgetDivisions ?? [];
  if (budgetDivs.length) {
    /* A row may carry its division in csi_division OR in the first two digits
       of csi_code — the grid accepts either and the rollup already reads both.
       Reading only csi_division reported division 03 as missing on an estimate
       that plainly had two lines of concrete in it. */
    const present = new Set(
      rows.filter((r) => !r.is_excluded).map((r) => {
        const d = String(r.csi_division ?? '').replace(/\D/g, '').slice(0, 2);
        if (d.length === 2) return d;
        return String(r.csi_code ?? '').replace(/\D/g, '').slice(0, 2);
      }).filter((d) => d.length === 2),
    );
    const missing = budgetDivisions(budgetDivs).filter((d) => !present.has(d));
    if (missing.length) {
      findings.push({
        severity: 'warn',
        title: `${missing.length} budgeted division${missing.length === 1 ? '' : 's'} with no estimate lines`,
        detail: `The budget carries ${missing.join(', ')} and the estimate does not. Either the scope is somebody else’s or it has been missed.`,
        count: missing.length,
      });
    }
  }

  /* ── notes: tidy-up, not risk ─────────────────────────────────────────── */

  const noCode = idx((r) => !r.is_excluded && !String(r.csi_code ?? '').trim() && !String(r.csi_division ?? '').trim());
  if (noCode.length) {
    findings.push({
      severity: 'note',
      title: `${noCode.length} line${noCode.length === 1 ? '' : 's'} without a cost code`,
      detail: 'Uncoded lines do not roll up against the budget and are awkward to buy out.',
      count: noCode.length, rows: noCode,
    });
  }

  const excluded = idx((r) => !!r.is_excluded);
  if (excluded.length) {
    findings.push({
      severity: 'note',
      title: `${excluded.length} exclusion${excluded.length === 1 ? '' : 's'} to carry onto the proposal`,
      detail: 'Excluded scope prices nothing here, and has to appear in writing on the document the client signs.',
      count: excluded.length, rows: excluded,
    });
  }

  const seen = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const k = String(r.description ?? '').trim().toLowerCase();
    if (!k) return;
    const a = seen.get(k) ?? []; a.push(i); seen.set(k, a);
  });
  const dupes = [...seen.values()].filter((a) => a.length > 1);
  if (dupes.length) {
    findings.push({
      severity: 'note',
      title: `${dupes.length} description${dupes.length === 1 ? ' appears' : 's appear'} more than once`,
      detail: 'Sometimes correct — the same scope in two areas. Sometimes a paste that landed twice.',
      count: dupes.length, rows: dupes.flat(),
    });
  }

  const order: Record<FindingSeverity, number> = { blocker: 0, warn: 1, note: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const blockers = findings.filter((f) => f.severity === 'blocker').length;
  const warnings = findings.filter((f) => f.severity === 'warn').length;
  const pricedLines = rows.filter((r) => !r.is_excluded && lineTotals(r).total > 0).length;
  const totalLines = rows.length;

  /* A blocker means the number itself is wrong, so it caps the score hard.
     Otherwise the score is the share of value nothing is flagged against.
     A warning caps it just below full marks even when it carries no money —
     "100" beside "1 thing unresolved" reads as a contradiction, and the point
     of the number is to be trusted at a glance. */
  let score = totalValue > 0 ? Math.round(((totalValue - Math.min(unresolvedValue, totalValue)) / totalValue) * 100) : (totalLines ? 0 : 100);
  if (warnings > 0) score = Math.min(score, 92);
  if (blockers > 0) score = Math.min(score, 45);

  return { findings, blockers, warnings, score, pricedLines, totalLines };
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** Two-digit divisions from a mixed list of codes and divisions. */
function budgetDivisions(list: string[]): string[] {
  return [...new Set(list.map((d) => String(d).trim().slice(0, 2)).filter((d) => /^\d{2}$/.test(d)))].sort();
}
