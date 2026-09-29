/**
 * sales-journey — how a deal becomes a job, in the order it really happens.
 *
 * lib/project-phase teaches what to do with a project you already have. It
 * opens at "Create your project", which is one stage too late: in real life a
 * lead arrives, somebody works it, it becomes a customer, it gets priced, and
 * only then is there a project to teach anybody about. Everything a
 * salesperson does happens before step 1 of that journey, and until now the
 * product never named it.
 *
 * DELIBERATELY NOT PART OF project-phase's list. That file's steps are read by
 * BOTH the journey rail and the navigation, so the numbers in the rail and the
 * numbers in the menu are literally the same list — a bug that was fixed once
 * by dropping "Create your project" the moment a project exists. Prepending
 * sales steps there would re-break that alignment. This is its own sequence,
 * on its own rail, and it hands over to that one at the end.
 *
 * Every step is checked from live data by /api/sales-journey. Nothing is ever
 * locked or forward-only: a step that is not done is still a link.
 */

export interface SalesStep {
  /** Stable id — the signal key /api/sales-journey answers with. */
  key: SalesSignalKey;
  title: string;
  desc: string;
  href: string;
}

export type SalesSignalKey =
  | 'lead'
  | 'worked'
  | 'qualified'
  | 'customer'
  | 'priced'
  | 'won';

/** The counts /api/sales-journey returns. A missing key means "could not
 *  check", never "zero" — a failed count must not tick or untick a step. */
export interface SalesSignals {
  leads?: number;
  activities?: number;
  qualified?: number;
  customers?: number;
  bidPackages?: number;
  projects?: number;
}

export const SALES_STEPS: SalesStep[] = [
  {
    key: 'lead',
    title: 'Take the lead in',
    desc: 'Name, company, what they want and roughly what it is worth. Thirty seconds now saves the whole trail later.',
    href: '/app/leads',
  },
  {
    key: 'worked',
    title: 'Work it and set the next action',
    desc: 'Log the call. Say what happens next and when. That date is what puts it on your day in My Work.',
    href: '/app/leads',
  },
  {
    key: 'qualified',
    title: 'Qualify it',
    desc: 'Real budget, real timeline, right fit. Move it to Qualified and it starts counting toward your pipeline.',
    href: '/app/leads',
  },
  {
    key: 'customer',
    title: 'Make them a customer',
    desc: 'A customer record outlives the deal — their people, their jobs and their history all hang off it.',
    href: '/app/customers',
  },
  {
    key: 'priced',
    title: 'Price the work',
    desc: 'Take off the drawings and put packages out to your subs. What comes back becomes the number you submit.',
    href: '/app/bids',
  },
  {
    key: 'won',
    title: 'Win it and open the job',
    desc: 'Mark the lead Won and start the project from the customer. From here the build journey takes over.',
    href: '/app/projects/new',
  },
];

/**
 * Which steps are behind you.
 *
 * A signal that came back undefined leaves its step unticked rather than
 * guessing — the same discipline /api/company-tools uses, for the same reason:
 * a failed count must never be shown as a confident zero.
 */
export function salesStepsDone(s: SalesSignals | null): Record<SalesSignalKey, boolean> {
  const n = (v: number | undefined) => (typeof v === 'number' ? v : 0);
  return {
    lead: n(s?.leads) > 0,
    worked: n(s?.activities) > 0,
    qualified: n(s?.qualified) > 0,
    customer: n(s?.customers) > 0,
    priced: n(s?.bidPackages) > 0,
    won: n(s?.projects) > 0,
  };
}

/** Stages at or past "this is a real opportunity". Matches the stage
 *  vocabulary in app/app/leads/page.tsx — keep the two in step. */
export const QUALIFIED_STAGES = ['Qualified', 'Proposal', 'Negotiation', 'Won'] as const;
