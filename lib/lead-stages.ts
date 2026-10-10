/**
 * lib/lead-stages.ts — the ONE canonical vocabulary for sales pipeline stages.
 *
 * The pipeline had rows stored as both `negotiation` and `Negotiation`,
 * `proposal` and `Proposal`, plus lowercase `qualified`/`new`. Every reader
 * compared the stage string case-sensitively, so each one silently dropped the
 * rows written in the other casing — the qualified pipeline read 3 deals /
 * $9.512M when the rows actually held 7 deals / $12.932M ($3.42M invisible).
 *
 * Canonical form is Title Case, matching the labels the leads board and
 * sales-journey already use. `normaliseStage()` maps any casing/synonym to the
 * canonical value; call it on every WRITE so the column can never drift again.
 * MUST-PASS Path 10.
 */

export const LEAD_STAGES = [
  'New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Where a lead came from — the pick-list on the lead form and the deal page's Edit. */
export const LEAD_SOURCES = [
  'Website', 'Referral', 'Cold Call', 'Social Media', 'Trade Show', 'Advertisement', 'Repeat Client', 'Other',
] as const;

/** Stages that count as "qualified pipeline" (qualified through close). */
export const QUALIFIED_STAGES = ['Qualified', 'Proposal', 'Negotiation', 'Won'] as const;
export const OPEN_STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation'] as const;

const CANON: Record<string, LeadStage> = {};
for (const s of LEAD_STAGES) CANON[s.toLowerCase()] = s;
// common synonyms seen in imports / older seeds
Object.assign(CANON, {
  'closed won': 'Won', 'closed-won': 'Won', 'closedwon': 'Won',
  'closed lost': 'Lost', 'closed-lost': 'Lost', 'closedlost': 'Lost',
  'prospect': 'New', 'prospecting': 'New', 'lead': 'New',
});

/**
 * Map any stage string to the canonical Title-Case value.
 * Unknown values are returned trimmed-and-unchanged rather than forced, so a
 * genuinely new stage is never silently rewritten to 'New'; pass a fallback for
 * the empty case (create defaults to 'New').
 */
export function normaliseStage(raw: string | null | undefined, fallback: LeadStage = 'New'): string {
  if (raw == null || String(raw).trim() === '') return fallback;
  const key = String(raw).trim().toLowerCase();
  return CANON[key] ?? String(raw).trim();
}

export const isWon = (s: string | null | undefined) => normaliseStage(s) === 'Won';
export const isLost = (s: string | null | undefined) => normaliseStage(s) === 'Lost';
export const isOpen = (s: string | null | undefined) => (OPEN_STAGES as readonly string[]).includes(normaliseStage(s));

/* ──────────────────────────────────────────────────────────────────────────
 * ONE aggregation (MUST-PASS Path 14 — the numbers agree everywhere).
 *
 * The leads board, the sales overview (SalesOverview.byStage) and the
 * sales-journey "qualified" signal each used to bucket leads by stage their own
 * way: the board seeded the canonical STAGES and `if (byStage[l.stage])`-guarded
 * every lead — silently DROPPING any row whose casing didn't match (the Path 10
 * bug, one screen lower); the overview keyed off the raw `String(l.stage)` with
 * no normalisation; the journey counted a case-SENSITIVE `.in('stage', ...)` at
 * the database. Three roll-your-owns over one column is three chances to drift.
 *
 * summariseByStage() is the single bucketer. It normalises every stage through
 * normaliseStage() first, so 'qualified', 'Qualified' and 'CLOSED WON' all land
 * where they belong, and an empty/missing stage becomes UNSTAGED rather than
 * being dropped or silently folded into 'New'. qualifiedValue() reads the
 * qualified-pipeline total off that one summary using the one QUALIFIED_STAGES
 * list, so every caller counts the same rows the same way.
 * ────────────────────────────────────────────────────────────────────────── */

/** The bucket a stage with no value yet still occupies — never dropped. */
export const UNSTAGED = 'Unstaged';

export interface StageSummary {
  count: number;
  value: number;
}

type StageLike = { stage?: string | null; estimated_value?: number | string | null };

/** The canonical stage key for one lead — normalised, empty → UNSTAGED. */
export function stageKey(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return UNSTAGED;
  return normaliseStage(raw);
}

/**
 * Bucket leads by canonical stage. The ONE function the board, the sales
 * overview and the journey signal all read. Keys are canonical Title-Case
 * stages (plus UNSTAGED, plus any genuinely-unknown stage preserved verbatim);
 * nothing is ever dropped. `value` sums estimated_value, coercing safely.
 */
export function summariseByStage(leads: readonly StageLike[]): Record<string, StageSummary> {
  const out: Record<string, StageSummary> = {};
  for (const l of leads) {
    const k = stageKey(l.stage);
    (out[k] ??= { count: 0, value: 0 });
    out[k].count += 1;
    out[k].value += Number(l.estimated_value) || 0;
  }
  return out;
}

/** Qualified-pipeline total (count + value) read off a summariseByStage map. */
export function qualifiedValue(summary: Record<string, StageSummary>): StageSummary {
  return (QUALIFIED_STAGES as readonly string[]).reduce<StageSummary>(
    (acc, s) => {
      const b = summary[s];
      return b ? { count: acc.count + b.count, value: acc.value + b.value } : acc;
    },
    { count: 0, value: 0 },
  );
}
