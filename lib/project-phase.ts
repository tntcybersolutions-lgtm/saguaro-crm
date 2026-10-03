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
  { value: 'bidding',  title: "We're Bidding It", detail: 'Takeoff, estimate, bid packages, proposal' },
  { value: 'building', title: 'We Won It',        detail: 'Budget, subs, schedule, field, pay apps' },
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
  { key: 'takeoff',      title: 'Measure the Drawings', desc: 'Upload the plans and the system measures and prices every trade from them.', href: '/takeoff' },
  { key: 'estimate',     title: 'Price It',              desc: 'The estimate builds from the takeoff, rolled up by CSI division.', href: '/estimate' },
  /* Levelling is FOLDED IN here rather than being its own step. It has no
     standalone screen — you level a specific package, from that package —
     so a separate step would have carried a number the navigation could
     never show, and a sequence whose numbers do not match the menu is the
     problem this file exists to solve. */
  { key: 'bid-packages', title: 'Send Bid Packages',     desc: 'Scoped packages go out to your subs. Levelling compares what comes back — spread, gaps, coverage.', href: '/bid-packages' },
  { key: 'proposal',     title: 'Submit the Proposal',   desc: 'The jacket: scope, quantities and your number in one document.', href: '/proposal' },
];

/**
 * BUILDING — you won it. Starts where the bid left off and runs to closeout.
 * These are the original journey's steps 3 onward, which were always the
 * right sequence for a job in hand.
 */
export const BUILDING_STEPS: PhaseStep[] = [
  { key: 'budget',     title: 'Set Contract & Budget', desc: 'Confirm the contract sum. Budget lines come from the takeoff.', href: '/budget' },
  { key: 'subs',       title: 'Award & Onboard Subs',  desc: 'Award the winners — contracts, insurance and W-9s collect themselves.', href: '/subs' },
  { key: 'schedule',   title: 'Build the Schedule',    desc: 'Sequence the work. The critical path drives field priorities.', href: '/schedule' },
  { key: 'daily-logs', title: 'Run the Field',         desc: 'Daily logs capture crews, weather and progress from the site.', href: '/daily-logs' },
  { key: 'pay-apps',   title: 'Bill the Owner',        desc: 'The G702/G703 builds itself from live project data.', href: '/pay-apps' },
  { key: 'closeout',   title: 'Close It Out',          desc: 'Punch, closeout documents, and the job comes off your active list.', href: '/closeout' },
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
  /* Budget first (step 1), then EXECUTION where Subcontractors and Schedule
     live (2 and 3), then FIELD (4), then back to FINANCIAL for pay apps... —
     except a section can only appear once. FINANCIAL holds both step 1 and
     step 5, so it leads: a GC sets the contract before anything else, and
     billing is where they return to it. */
  building: ['PROJECT', 'FINANCIAL', 'EXECUTION', 'FIELD', 'CLOSEOUT', 'COMMUNICATION'],
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

/* ─────────────────────────────────────────────────────────────────────────
   WHICH STEPS ARE BEHIND YOU

   Lifted out of components/GettingStartedRail so the rail, the navigation and
   the always-on "you are here" bar all answer this question with the same
   code. Three readers computing it three ways is how a screen ends up telling
   a user two different things about the same job, which is the fastest way to
   make them stop trusting any of it.

   MONEY rule: DB numerics can round-trip as strings — Number(x)||0 before math.
   ───────────────────────────────────────────────────────────────────────── */

/** The slice of /api/project-context these checks read. Everything optional:
 *  a context that failed to load must leave steps unticked, never crash. */
export interface PhaseContextLike {
  project?: { phase?: unknown; status?: unknown } | null;
  takeoff?: { completed?: unknown; pricedTotal?: unknown } | null;
  budget?: { lineCount?: number } | null;
  bidPackages?: Array<Record<string, unknown>> | null;
  subs?: unknown[] | null;
  counts?: { scheduleTasks?: number } | null;
  recent?: { lastDailyLogDate?: unknown; dailyLogDays?: unknown } | null;
  /** From /api/project-context — proposal versions on the job. */
  proposal?: { count?: number; accepted?: unknown; latest?: { status?: unknown } | null } | null;
}

export interface PhaseMoneyLike {
  originalContract?: unknown;
  payAppCount?: unknown;
  submittedPayAppCount?: unknown;
}

/** "Run the field" is a habit, not an entry: daily logs on at least this many
 *  distinct days. One log on day one used to tick the step, which told a GC
 *  their field reporting was done the first afternoon. Three days is the
 *  smallest number that reads as "the crew is logging" rather than "someone
 *  tried the screen", and it is reachable inside the first week of a job. */
export const FIELD_LOG_DAYS_DONE = 3;

/**
 * WHAT "DONE" MEANS — each test is the thing actually having happened, not a
 * record existing. A tick the user did not earn is worse than no tick: it
 * tells them to skip a step they still owe.
 *
 *   budget        contract sum > 0 AND at least one budget line. Winning a
 *                 job with a $0 contract and no lines used to tick this.
 *   bid-packages  at least one sub INVITED on some package. A package that
 *                 was drafted and never sent to anyone is not "sent".
 *   daily-logs    logs on >= FIELD_LOG_DAYS_DONE distinct days.
 *   pay-apps      a pay app SUBMITTED to the owner (submitted / approved /
 *                 certified / paid). The draft auto-created on win is not a
 *                 bill.
 */
export function stepsDone(
  ctx: PhaseContextLike | null | undefined,
  money: PhaseMoneyLike | null | undefined,
  isClosed: (status: unknown) => boolean,
): Record<string, boolean> {
  const contract = Number(money?.originalContract) || 0;
  const lineCount = Number(ctx?.budget?.lineCount) || 0;
  const packages = ctx?.bidPackages || [];
  /* A closed job's journey is over. Scoring it step by step left a closed
     project's rail and "you are here" bar still pointing at "Set contract &
     budget" — the building checklist outliving the building. Every step reads
     as behind you, so the rail steps aside and the bar says the job is done. */
  if (isClosed(ctx?.project?.status)) {
    return Object.fromEntries(
      [...BIDDING_STEPS, ...BUILDING_STEPS, { key: 'leveling' }].map((s) => [s.key, true]),
    );
  }
  return {
    takeoff:        Boolean(ctx?.takeoff?.completed),
    estimate:       (Number(ctx?.takeoff?.pricedTotal) || 0) > 0 || lineCount > 0,
    'bid-packages': packages.some((p) => (Number(p?.invitedCount) || 0) > 0),
    leveling:       packages.some((p) => Boolean(p?.awardedTo)),
    /* A proposal step is done when a proposal actually went out (sent,
       viewed, signed or accepted). A contract amount typed in when the job was
       created used to tick it, so a job still bidding read "every stage done".
       Callers without proposal data keep the old contract rule. */
    proposal:       ctx?.proposal
      ? Boolean(ctx.proposal.accepted) || ['sent', 'viewed', 'signed', 'accepted'].includes(String(ctx.proposal.latest?.status || '').toLowerCase())
      : contract > 0,
    budget:         contract > 0 && lineCount > 0,
    subs:           (ctx?.subs || []).length > 0,
    schedule:       (Number(ctx?.counts?.scheduleTasks) || 0) > 0,
    'daily-logs':   (Number(ctx?.recent?.dailyLogDays) || 0) >= FIELD_LOG_DAYS_DONE,
    'pay-apps':     (Number(money?.submittedPayAppCount) || 0) > 0,
    closeout:       isClosed(ctx?.project?.status),
  };
}

/** The first step not yet behind you, or null when the phase is complete. */
export function currentStep(
  phase: ProjectPhase,
  done: Record<string, boolean>,
): { step: PhaseStep; index: number } | null {
  const steps = stepsForPhase(phase);
  const i = steps.findIndex((s) => !done[s.key]);
  return i === -1 ? null : { step: steps[i], index: i };
}
