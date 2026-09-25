/**
 * project-phase — is this job one we are CHASING, or one we are BUILDING?
 *
 * WHY THIS EXISTS
 *
 * Users kept asking "where do we start", and the honest reason is that the
 * product held two contradictory opinions about the order and reconciled
 * neither.
 *
 *   The journey rail (components/GettingStartedRail) taught:
 *     create project -> price the drawings -> SET CONTRACT & BUDGET ->
 *     send bid packages -> award subs -> schedule -> field -> bill -> paid
 *
 *   The navigation taught:
 *     PRECONSTRUCTION (takeoff, estimate, bid packages, proposal) ->
 *     EXECUTION -> FINANCIAL -> FIELD -> ...
 *
 * They disagree — the journey never mentions Estimate or Proposal at all,
 * and puts Budget third while the nav files it under FINANCIAL. Worse, the
 * journey's third step assumes you ALREADY WON: "confirm the contract sum".
 * A GC chasing a bid follows the product's own guidance straight into a step
 * that cannot apply to them.
 *
 * That is not a menu-ordering problem. There are genuinely TWO flows, and
 * the product was trying to describe them with one list.
 *
 * Procore solves this with a stage on the project, and `projects.phase`
 * already exists here — text, defaulting to 'preconstruction', in the update
 * allowlist and read by absolutely nothing. The field was waiting.
 *
 * ONE QUESTION AT CREATION decides it: "are you bidding this, or did you win
 * it?" Everything downstream — which journey, which order, which tools lead
 * — reads from the answer.
 */

/** The two states that matter to a GC. Stored in projects.phase. */
export type ProjectPhase = 'bidding' | 'building';

/** projects.phase default is 'preconstruction'. Existing rows carry that, or
 *  null, or values from earlier experiments, so every read normalises. A job
 *  that has not said otherwise is being chased, not built — that is the
 *  earlier state and the safer assumption, since showing bid tools to
 *  somebody mid-construction is a smaller error than hiding them from
 *  somebody who is bidding. */
export function normalisePhase(raw: unknown): ProjectPhase {
  const s = String(raw ?? '').toLowerCase().trim();
  if (['building', 'construction', 'course_of_construction', 'active', 'execution', 'post_construction', 'closeout', 'warranty'].includes(s)) return 'building';
  return 'bidding';
}

export const PHASE_LABEL: Record<ProjectPhase, string> = {
  bidding: 'Bidding',
  building: 'Building',
};

/** What the choice says, in a GC's words, at project creation. */
export const PHASE_CHOICES: { value: ProjectPhase; title: string; detail: string }[] = [
  { value: 'bidding',  title: "We're bidding it", detail: 'Takeoff, estimate, bid packages, proposal' },
  { value: 'building', title: 'We won it',        detail: 'Budget, subs, schedule, field, pay apps' },
];

export interface PhaseStep {
  /** Stable id, so "done" can be computed against project context. */
  key: string;
  title: string;
  desc: string;
  /** Project-relative href. '' is the project overview. */
  href: string;
}

/**
 * BIDDING — chasing the job. Ends at the proposal going out, because that is
 * where a bid actually ends. It does NOT continue into budget and pay apps:
 * pretending a bid flows into billing is what made the single journey wrong.
 */
export const BIDDING_STEPS: PhaseStep[] = [
  { key: 'takeoff',      title: 'Take off the drawings', desc: 'Drop the plan set. Every trade measured and priced from it.', href: '/takeoff' },
  { key: 'estimate',     title: 'Price it',              desc: 'The estimate builds from the takeoff, rolled up by CSI division.', href: '/estimate' },
  /* Levelling is FOLDED IN here rather than being its own step. It has no
     standalone screen — you level a specific package, from that package —
     so a separate step would have carried a number the navigation could
     never show, and a sequence whose numbers do not match the menu is the
     problem this file exists to solve. */
  { key: 'bid-packages', title: 'Send bid packages',     desc: 'Scoped packages go out to your subs. Levelling compares what comes back — spread, gaps, coverage.', href: '/bid-packages' },
  { key: 'proposal',     title: 'Submit the proposal',   desc: 'The jacket: scope, quantities and your number in one document.', href: '/proposal' },
];

/**
 * BUILDING — you won it. Starts where the bid left off and runs to closeout.
 * These are the original journey's steps 3 onward, which were always the
 * right sequence for a job in hand.
 */
export const BUILDING_STEPS: PhaseStep[] = [
  { key: 'budget',     title: 'Set contract & budget', desc: 'Confirm the contract sum. Budget lines come from the takeoff.', href: '/budget' },
  { key: 'subs',       title: 'Award & onboard subs',  desc: 'Award the winners — contracts, insurance and W-9s collect themselves.', href: '/subs' },
  { key: 'schedule',   title: 'Build the schedule',    desc: 'Sequence the work. The critical path drives field priorities.', href: '/schedule' },
  { key: 'daily-logs', title: 'Run the field',         desc: 'Daily logs capture crews, weather and progress from the site.', href: '/daily-logs' },
  { key: 'pay-apps',   title: 'Bill the owner',        desc: 'The G702/G703 builds itself from live project data.', href: '/pay-apps' },
  { key: 'closeout',   title: 'Close it out',          desc: 'Punch, closeout documents, and the job comes off your active list.', href: '/closeout' },
];

export const stepsForPhase = (phase: ProjectPhase): PhaseStep[] =>
  phase === 'building' ? BUILDING_STEPS : BIDDING_STEPS;

/**
 * The nav sections that LEAD for each phase, in order.
 *
 * Not a filter — every section is still reachable and in its fixed place.
 * This decides which ones open first and which carry a step number, so the
 * rail reads as the sequence the journey is teaching rather than as a
 * different taxonomy sitting next to it.
 */
export const LEADING_SECTIONS: Record<ProjectPhase, string[]> = {
  bidding:  ['PROJECT', 'PRECONSTRUCTION'],
  building: ['PROJECT', 'FINANCIAL', 'EXECUTION', 'FIELD', 'COMMUNICATION', 'CLOSEOUT'],
};

/**
 * Step number for a project-relative href, within the current phase — so the
 * nav can print "1 Takeoff, 2 Estimate, 3 Bid Packages" and have those
 * numbers mean the same thing as the journey rail on the overview.
 * Returns null for anything outside the phase's sequence, which stays
 * unnumbered rather than being given a misleading position.
 */
export function stepNumber(href: string, phase: ProjectPhase): number | null {
  const steps = stepsForPhase(phase);
  // Leveling shares bid-packages' href, so the first match wins and the
  // number stays on the package step where a user actually clicks.
  const i = steps.findIndex(s => s.href === href);
  return i >= 0 ? i + 1 : null;
}
