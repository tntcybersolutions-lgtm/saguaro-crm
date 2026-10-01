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
