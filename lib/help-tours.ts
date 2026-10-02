/**
 * Guided walkthroughs — the arrows that point at the button you need next.
 *
 * A GC signs in for the first time and the product is 223 pages deep. Every one
 * of them is discoverable and none of them is obvious, so the honest answer to
 * "how do I create a project?" has never been a help article — it is somebody
 * standing behind you pointing at the screen. This is that finger.
 *
 * A tour is a list of steps. Each step names the control it points at and how
 * it knows you did the thing. The engine (components/HelpMode.tsx) resolves the
 * anchor against the live DOM, draws an arrow at it, and advances when you act.
 * Steps carry a route, so a tour crosses pages: "create a project" starts in
 * the sidebar, passes through the form, and ends on a priced takeoff.
 *
 * Anchoring rules, in the order the engine tries them:
 *   1. `anchor`      CSS selectors. Prefer [data-tour="…"], then href.
 *   2. `anchorText`  visible text of a button or link. Exact match, then
 *                    contains. Several candidates allowed because button
 *                    wording changes and a tour that breaks silently is worse
 *                    than no tour.
 *
 * Every anchorText below was read off the actual page, character for
 * character — "Add time" not "Add entry", "New Pay Application" not "New pay
 * app", "Start AI Analysis" not "Run takeoff". Guessing the wording is how you
 * ship a walkthrough that points at nothing. When you add a control a tour
 * points at, give it data-tour; text matching is the fallback, not the plan.
 */

export type Advance =
  /** Completes when the anchor is clicked. */
  | 'click'
  /** Completes when the URL reaches `nextRoute`. */
  | 'route'
  /** Completes when the anchor (an input) holds a non-empty value. */
  | 'input'
  /** Completes when the reader presses "Got it" — for steps that only explain. */
  | 'read';

export interface TourStep {
  /** Short imperative heading: "Open Projects". */
  title: string;
  /** One or two sentences. What to do, and why it matters here. */
  body: string;
  /**
   * Where this step lives. Prefix match against the pathname; omit for a step
   * that works on any screen. The tour waits — arrow hidden, "take me there"
   * offered — until the reader is on it.
   */
  route?: string;
  /** CSS selectors, first visible match wins. */
  anchor?: string[];
  /** Fallback: visible text of a control. Exact match first, then contains. */
  anchorText?: string[];
  /** Narrow the text search. Defaults to buttons, links and role=button. */
  anchorTag?: string;
  advance: Advance;
  /** For advance:'route' — the pathname prefix that means this step is done. */
  nextRoute?: string;
}

/**
 * Is the reader on the screen this step lives on?
 *
 * `startsWith` is the obvious implementation and it is wrong, because "/app"
 * is a prefix of literally every route in the product. A step pinned to the
 * dashboard read as on-route on /app/projects/new, so instead of offering to
 * take you to the dashboard it hunted for a control that was never on that
 * page and announced it could not find it. Every step of the first-day
 * walkthrough failed that way.
 *
 * The rule, and it is the whole rule:
 *
 *   '/app'            exactly the dashboard, nothing under it
 *   '/app/projects'   exactly the project list, not a project
 *   '/app/projects/'  anywhere INSIDE a project — the trailing slash means
 *                     "and below", which is the only case that wants it
 */
export function routeMatches(route: string | undefined, pathname: string): boolean {
  if (!route) return true;
  const here = (pathname || '').replace(/\/+$/, '') || '/';
  if (route.endsWith('/')) {
    const base = route.replace(/\/+$/, '');
    return here !== base && here.startsWith(base + '/');
  }
  return here === route;
}

export interface Tour {
  id: string;
  /** Phrased the way a GC would ask it out loud. */
  question: string;
  /** One line under the question in the menu. */
  blurb: string;
  /** Menu grouping — the order a GC meets the product. */
  category: Category;
  /** Where the tour begins. The engine offers to take you there. */
  startRoute: string;
  steps: TourStep[];
}

export type Category =
  | 'First day'
  | 'Win the work'
  | 'Build it'
  | 'Get paid'
  | 'Run the business';

export const CATEGORY_ORDER: Category[] = [
  'First day',
  'Win the work',
  'Build it',
  'Get paid',
  'Run the business',
];

/* Sidebar links are <Link href>, so href is a stable anchor that survives any
   amount of restyling — and it is the only stable anchor on most of these
   screens, which carry no id or data-testid at all. */
const nav = (href: string, label: string): TourStep => ({
  title: `Open ${label}`,
  body: `${label} is in the left sidebar. Click it.`,
  anchor: [`aside a[href="${href}"]`, `a[href="${href}"]`],
  anchorText: [label],
  advance: 'route',
  nextRoute: href,
});

/* Several tours need "open a project first", and it is the one step with no
   fixed anchor — the card carries the customer's own project name. */
const OPEN_A_PROJECT: TourStep = {
  title: 'Open the job',
  body: 'Click the project you are working on. Budgets, pay applications, RFIs and drawings all live inside a project rather than on their own.',
  route: '/app/projects',
  anchor: ['[data-tour="project-card"]', 'a[href^="/app/projects/"]'],
  advance: 'click',
};

/**
 * A link in the rail down the left of an open project.
 *
 * `route: '/app/projects/'` — with the trailing slash — means "inside a
 * project". /app/projects/<id>/budget starts with it; the bare /app/projects
 * list does not. That distinction is what lets a step wait politely on the
 * list page instead of announcing it cannot find a control that is one click
 * away.
 */
const projectNav = (slug: string, label: string, body: string): TourStep => ({
  title: `Open ${label}`,
  body,
  route: '/app/projects/',
  anchor: [`[data-tour="project-nav-${slug}"]`],
  anchorText: [label],
  advance: 'click',
});

export const TOURS: Tour[] = [
  /* ─── First day ──────────────────────────────────────────────────────── */
  {
    id: 'first-day',
    question: 'I just signed in — what do I do first?',
    blurb: 'The five minutes that make everything else work.',
    category: 'First day',
    startRoute: '/app',
    steps: [
      {
        title: 'Start here',
        body: 'This checklist is your path from an empty account to money in the bank. Nine steps, in order. It tracks itself as you go.',
        route: '/app',
        anchor: ['[data-tour="getting-started"]'],
        advance: 'read',
      },
      {
        title: 'Everything hangs off a project',
        body: 'Budget, drawings, daily logs, pay applications, photos and RFIs all belong to a project. Until one exists, most of Saguaro has nothing to show you — which is why this screen looks quiet right now.',
        route: '/app',
        advance: 'read',
      },
      {
        title: 'Create the first one',
        body: 'This takes you to the form. Only the name and address are required — Saguaro seeds the project number, retainage, jurisdiction and folders itself.',
        route: '/app',
        anchor: ['a[href="/app/projects/new"]'],
        anchorText: ['New Project', 'Create your first project', 'Create your project'],
        advance: 'route',
        nextRoute: '/app/projects/new',
      },
      {
        title: 'Now walk the rest',
        body: 'Close this and pick "How do I create a project?" — it runs the whole flow, through uploading your drawings and getting them priced.',
        advance: 'read',
      },
    ],
  },
  {
    id: 'find-my-way',
    question: 'How do I find my way around?',
    blurb: 'What the sidebar sections mean and where things live.',
    category: 'First day',
    startRoute: '/app',
    steps: [
      {
        title: 'Overview',
        body: 'Your dashboard, everything assigned to you, the project list, your people and the time clock. This is the part you use daily.',
        anchor: ['aside a[href="/app/projects"]'],
        advance: 'read',
      },
      {
        title: 'Pre-Construction',
        body: 'Before you break ground: bids and estimates, the AI takeoff studio, your materials catalog and the intelligence view that compares jobs side by side.',
        anchor: ['aside a[href="/app/takeoff"]'],
        advance: 'read',
      },
      {
        title: 'Execution',
        body: 'While you are building: documents, daily logs, the schedule, the phone app your crew uses, and Saguaro Radio.',
        anchor: ['aside a[href="/app/daily-logs"]'],
        advance: 'read',
      },
      {
        title: 'Financial',
        body: 'Invoicing, your subscription, and reports across every job.',
        anchor: ['aside a[href="/app/invoicing"]'],
        advance: 'read',
      },
      {
        title: 'Anything, instantly',
        body: 'Press ⌘K — or Ctrl+K — anywhere to jump straight to a page or a project without hunting through the sidebar.',
        anchorText: ['Search'],
        advance: 'read',
      },
    ],
  },

  /* ─── Win the work ───────────────────────────────────────────────────── */
  {
    id: 'create-project',
    question: 'How do I create a project?',
    blurb: 'Job type, name, address — then upload the drawings and get them priced.',
    category: 'Win the work',
    startRoute: '/app/projects',
    steps: [
      nav('/app/projects', 'Projects'),
      {
        title: 'Start a new project',
        body: 'This is the only button you need. Saguaro fills in the project number, retainage and jurisdiction for you.',
        route: '/app/projects',
        anchor: ['a[href="/app/projects/new"]'],
        anchorText: ['New Project', 'Create Your First Project'],
        advance: 'route',
        nextRoute: '/app/projects/new',
      },
      {
        title: 'Pick the kind of job',
        body: 'This one choice sets your retainage, contract type, CSI divisions and document folders. Ground-up gets the full 17-division spread; a service call gets four folders and no retainage.',
        route: '/app/projects/new',
        anchor: ['[data-tour="job-type-ground-up"]', '[data-tour^="job-type-"]'],
        anchorText: ['Ground-up construction'],
        advance: 'click',
      },
      {
        title: 'Name the job',
        body: 'Use the name the owner uses — it goes on the contract, every RFI and every pay application. This is one of only two required fields.',
        route: '/app/projects/new',
        anchor: ['[data-tour="project-name"]', 'input[placeholder^="e.g. Riverdale"]'],
        advance: 'input',
      },
      {
        title: 'Add the address',
        body: 'Saguaro reads the state off this as you type — that is what drives your lien waiver deadlines and prevailing wage rules. This is the second required field; everything else is optional.',
        route: '/app/projects/new',
        anchor: ['[data-tour="project-address"]', 'input[placeholder^="123 Main St"]'],
        advance: 'input',
      },
      {
        title: 'Create it and go straight to the drawings',
        body: 'This creates the project, its folders, its CSI budget structure and its document set — then takes you into the takeoff. There is a "Create without drawings" beside it if you are not ready.',
        route: '/app/projects/new',
        anchor: ['[data-tour="create-project-submit"]'],
        anchorText: ['Create & add drawings →', 'Create & add drawings'],
        advance: 'click',
      },
      {
        title: 'Drop the plan set in',
        body: 'Click the drop zone and pick your drawings — PDF, PNG, JPG or TIFF, up to 200MB. A full multi-page set is the normal case, not the exception.',
        anchor: ['[data-tour="takeoff-dropzone"]', 'input[type="file"]'],
        advance: 'read',
      },
      {
        title: 'Start the analysis',
        body: 'Saguaro reads each discipline in parallel, so a full set comes back in a minute or two rather than an afternoon.',
        anchor: ['[data-tour="run-takeoff"]'],
        anchorText: ['Start AI Analysis'],
        advance: 'click',
      },
      {
        title: 'That is a project',
        body: 'You now have a priced takeoff by CSI division, folders, and a document set. From here one button builds the bid packages, schedule of values and lien waivers.',
        advance: 'read',
      },
    ],
  },
  {
    id: 'upload-blueprints',
    question: 'How do I upload blueprints and get them priced?',
    blurb: 'Drop in the plan set — Saguaro reads the sheets and prices the work.',
    category: 'Win the work',
    startRoute: '/app/takeoff',
    steps: [
      nav('/app/takeoff', 'Takeoff Studio'),
      {
        title: 'Drop the drawings here',
        body: 'Click the drop zone or drag the file onto it. PDF, PNG, JPG, TIFF or WebP, up to 200MB — a full multi-page set is normal.',
        route: '/app/takeoff',
        anchor: ['[data-tour="takeoff-dropzone"]', 'input[type="file"]'],
        anchorText: ['Drop blueprints here', 'Upload blueprint'],
        advance: 'read',
      },
      {
        title: 'Say which job it is for',
        body: 'Pick an existing project, or choose "+ New project…" and Saguaro creates one as it goes. A takeoff has to belong to a job so the pricing lands in the right budget.',
        route: '/app/takeoff',
        advance: 'read',
      },
      {
        title: 'Start it',
        body: 'You will see the eight passes it runs — indexing sheets, reading each discipline, counting and pricing. Watch it or walk away.',
        route: '/app/takeoff',
        anchor: ['[data-tour="run-takeoff"]'],
        anchorText: ['Start Analysis', 'Create project & analyze'],
        advance: 'click',
      },
      {
        title: 'Read the result',
        body: 'Quantities by CSI division, priced from your rates. Line Items, Cost Summary and Recommendations are the three tabs.',
        route: '/app/takeoff',
        anchorText: ['Line Items'],
        advance: 'read',
      },
      {
        title: 'Turn it into a bid',
        body: '"Build bid + compliance →" takes the priced takeoff and produces bid packages, a schedule of values and the lien waiver set in one pass.',
        route: '/app/takeoff',
        anchorText: ['Build bid + compliance →', 'Build bid + compliance'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'score-bid',
    question: 'Should I bid this job?',
    blurb: 'Score an opportunity against your own win/loss history.',
    category: 'Win the work',
    startRoute: '/app/bids',
    steps: [
      nav('/app/bids', 'Bids & Estimates'),
      {
        title: 'Score it before you chase it',
        body: 'Saguaro scores an opportunity against the jobs you have actually won and lost. Chasing work you do not win is the most expensive thing a contractor does.',
        route: '/app/bids',
        anchor: ['[data-tour="score-bid"]'],
        anchorText: ['Score a Bid'],
        advance: 'click',
      },
      {
        title: 'Let Sage fill it in',
        body: 'Pick an existing project and the amount, margin and trade come across automatically. Otherwise type them — only the name and amount are needed.',
        route: '/app/bids',
        advance: 'read',
      },
      {
        title: 'The three tabs',
        body: 'Active Packages is what you have out. Opportunity Pipeline is what you are considering. Bid History is what happened — and it is what the scoring learns from, so record outcomes.',
        route: '/app/bids',
        anchorText: ['Bid History'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'bid-packages',
    question: 'How do I send bid packages to subs?',
    blurb: 'Split the work by trade and get it out for pricing.',
    category: 'Win the work',
    startRoute: '/app/projects',
    steps: [
      nav('/app/projects', 'Projects'),
      OPEN_A_PROJECT,
      projectNav('bid-packages', 'Bid Packages',
        'A bid package is one trade’s scope pulled out of the takeoff, ready to send to the subs who do that work.'),
      {
        title: 'Level the bids you get back',
        body: 'When the numbers come in, Bid Leveling puts them side by side on the same scope so you are comparing like with like — that is where the missing exclusion shows up.',
        advance: 'read',
      },
    ],
  },
  {
    id: 'cost-rates',
    question: 'How do I set my own labor and material rates?',
    blurb: 'What every takeoff prices against.',
    category: 'Win the work',
    startRoute: '/app/takeoff',
    steps: [
      nav('/app/takeoff', 'Takeoff Studio'),
      {
        title: 'Open Cost rates',
        body: 'Every AI takeoff prices against these numbers. Set your real labor rates and material costs once and every estimate after it is yours rather than a generic average.',
        route: '/app/takeoff',
        anchor: ['a[href="/app/takeoff/rates"]'],
        anchorText: ['Cost rates'],
        advance: 'click',
      },
      {
        title: 'Assemblies too',
        body: 'The assembly library is the other half — a wall type or a fixture set you price as one unit instead of ten lines. Both feed the same takeoff.',
        advance: 'read',
      },
    ],
  },
  {
    id: 'catalog',
    question: 'How do I compare material prices?',
    blurb: 'Cross-vendor pricing, and turning a cart into purchase orders.',
    category: 'Win the work',
    startRoute: '/app/catalog',
    steps: [
      nav('/app/catalog', 'Catalog'),
      {
        title: 'What these prices are',
        body: 'Reference prices, marked REF — a seeded snapshot, not a live quote from your account. Use them to compare vendors, then confirm the real number before you commit.',
        route: '/app/catalog',
        advance: 'read',
      },
      {
        title: 'Build a cart',
        body: 'Add turns into a quantity stepper. When you are done, pick a project and Saguaro writes one draft purchase order per vendor into that job.',
        route: '/app/catalog',
        anchorText: ['Add'],
        advance: 'read',
      },
    ],
  },

  /* ─── Build it ───────────────────────────────────────────────────────── */
  {
    id: 'daily-log',
    question: 'How do I write a daily log?',
    blurb: 'Weather, crew, work done — the record that wins disputes.',
    category: 'Build it',
    startRoute: '/app/daily-logs',
    steps: [
      nav('/app/daily-logs', 'Daily Logs'),
      {
        title: 'Start today’s log',
        body: 'Pick the project and Saguaro carries forward the crew count, superintendent and phase from the last one. Only Project and Work Performed are required.',
        route: '/app/daily-logs',
        anchor: ['[data-tour="new-daily-log"]'],
        anchorText: ['New Log'],
        advance: 'click',
      },
      {
        title: 'Same as yesterday',
        body: 'If the crew and phase have not changed, this one button fills them in. It appears once the job has a previous log.',
        route: '/app/daily-logs',
        anchorText: ['Same as yesterday'],
        advance: 'read',
      },
      {
        title: 'Why this matters',
        body: 'A daily log is the record that settles a delay claim two years from now. Weather, who was on site, what got done. It takes a minute and it is the cheapest insurance on the job.',
        route: '/app/daily-logs',
        anchorText: ['Create Log'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'time-clock',
    question: 'How do I clock in and track hours?',
    blurb: 'GPS clock-in, fixing missed punches, submitting the week.',
    category: 'Build it',
    startRoute: '/app/time',
    steps: [
      nav('/app/time', 'Time Clock'),
      {
        title: 'Pick the job first',
        body: 'The project and cost code selectors decide where the next clock-in bills to. Set them before you clock in and labor cost lands on the right CSI division without anyone re-keying it.',
        route: '/app/time',
        advance: 'read',
      },
      {
        title: 'Clock in',
        body: 'One button — it becomes "Clock out" once a shift is open, and the punch is GPS-stamped.',
        route: '/app/time',
        anchorText: ['Clock in', 'Clock out'],
        advance: 'read',
      },
      {
        title: 'Fixing a missed punch',
        body: 'Add time backfills a day: date, in, out, meal break. Overtime splits itself from the hours.',
        route: '/app/time',
        anchorText: ['Add time'],
        advance: 'read',
      },
      {
        title: 'Submit the week',
        body: 'At week end this sends the timesheet for approval. If the database refuses it you will get an error — it will not tell you it saved and quietly drop the hours.',
        route: '/app/time',
        anchorText: ['Submit week'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'schedule',
    question: 'How do I build the schedule?',
    blurb: 'Tasks, durations, predecessors — list or Gantt.',
    category: 'Build it',
    startRoute: '/app/schedule',
    steps: [
      nav('/app/schedule', 'Schedule'),
      {
        title: 'Add the first task',
        body: 'Name, project, start and duration — the end date computes itself. Set a predecessor and the start date follows the task before it.',
        route: '/app/schedule',
        anchor: ['[data-tour="new-task"]'],
        anchorText: ['New Task'],
        advance: 'click',
      },
      {
        title: 'Two ways to look at it',
        body: 'List is for editing — percent complete and status are editable inline. Timeline is the Gantt view for seeing the shape of the job.',
        route: '/app/schedule',
        anchorText: ['Timeline'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'documents',
    question: 'How do I generate contracts, waivers and bonds?',
    blurb: 'Pay apps, lien waivers, AIA bond forms, certified payroll, closeout.',
    category: 'Build it',
    startRoute: '/app/documents',
    steps: [
      nav('/app/documents', 'Documents'),
      {
        title: 'Six shelves',
        body: 'Library is everything you have already generated. The other five tabs each generate a kind of document — pay applications, lien waivers, AIA bond forms, certified payroll and the closeout package.',
        route: '/app/documents',
        anchorText: ['Library'],
        advance: 'read',
      },
      {
        title: 'Bonds and AIA forms',
        body: 'A310, A312, G704, G706 and G707 generate as real PDFs against a project you pick. Choose the project first or it will tell you to.',
        route: '/app/documents',
        anchor: ['[data-tour="docs-tab-bonds-forms"]'],
        anchorText: ['Bonds & Forms'],
        advance: 'click',
      },
      {
        title: 'Everything lands in the Library',
        body: 'Whatever you generate — here, from a pay application, from a takeoff — files itself into Library so you are never hunting for the PDF you made last month.',
        route: '/app/documents',
        advance: 'read',
      },
    ],
  },
  {
    id: 'rfis',
    question: 'How do I raise an RFI?',
    blurb: 'Ask the question, assign the ball, record the answer.',
    category: 'Build it',
    startRoute: '/app/projects',
    steps: [
      nav('/app/projects', 'Projects'),
      OPEN_A_PROJECT,
      projectNav('rfis', 'RFIs',
        'A Request for Information is how you get an answer on record instead of in somebody’s inbox.'),
      {
        title: 'Create it',
        body: 'Subject is the only required field. The number, the seven-day response date and the architect as ball-in-court are all filled in for you.',
        anchor: ['[data-tour="create-rfi"]'],
        anchorText: ['Create RFI', 'Create First RFI'],
        advance: 'click',
      },
      {
        title: 'Ball in court',
        body: 'Whoever holds the ball owes you an answer, and the overdue filter shows who is late. That list is what you take into the OAC meeting.',
        advance: 'read',
      },
    ],
  },
  {
    id: 'radio',
    question: 'How does Saguaro Radio work?',
    blurb: 'Push-to-talk for the crew, and turning a call into a record.',
    category: 'Build it',
    startRoute: '/app/radio',
    steps: [
      nav('/app/radio', 'Saguaro Radio'),
      {
        title: 'Channels are per job',
        body: 'Each project gets its own talkgroup, so the framing crew is not listening to the plumbers. Open a project and its All Hands channel is created for you.',
        route: '/app/radio',
        anchorText: ['New talkgroup'],
        advance: 'read',
      },
      {
        title: 'Hold to talk',
        body: 'Hold the button — or hold the space bar — to transmit, let go to listen. It runs over data, so it works anywhere there is signal and there are no handhelds to buy.',
        route: '/app/radio',
        anchorText: ['HOLD TO TALK', 'Hold to talk'],
        advance: 'read',
      },
      {
        title: 'Turn a call into a record',
        body: 'This is the part no radio does. "Make a record" turns a transmission into an RFI or a daily log entry with the voice clip attached — so what was said on site becomes what is on file.',
        route: '/app/radio',
        anchorText: ['Make a record'],
        advance: 'read',
      },
      {
        title: 'Catch me up',
        body: 'Been off the channel? This plays every transmission you missed, in order. The panic button beside it alerts every member of the channel at once.',
        route: '/app/radio',
        anchorText: ['Catch me up'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'signal-heatmap',
    question: 'How do I read the signal heatmap?',
    blurb: 'Where coverage is good on site, and where it is not.',
    category: 'Build it',
    startRoute: '/app/signal-studio',
    steps: [
      nav('/app/signal-studio', 'Signal Studio'),
      {
        title: 'What the heatmap shows',
        body: 'Measured signal strength across the site — warm where coverage is strong, cold where it drops out. It is built from real readings the field app takes as the crew moves around, not a prediction.',
        route: '/app/signal-studio',
        anchor: ['[data-tour="heatmap"]', 'canvas', 'svg'],
        advance: 'read',
      },
      {
        title: 'Why you care',
        body: 'Cold zones are where clock-ins fail, photos will not upload and radio cuts out. Knowing them before the crew finds them is the difference between a fix and a complaint.',
        route: '/app/signal-studio',
        advance: 'read',
      },
      {
        title: 'The same map, live',
        body: 'Saguaro Radio has a Site Map view showing crew positions on this same heatmap — useful when you need to know who is where and whether they can hear you.',
        advance: 'read',
      },
    ],
  },
  {
    id: 'field-app',
    question: 'How does the crew use this in the field?',
    blurb: 'The phone app: clock-in, photos, logs, and offline.',
    category: 'Build it',
    startRoute: '/app',
    steps: [
      {
        title: 'Your crew does not use this screen',
        body: 'They get a phone app: GPS clock-in, photos, daily logs, punch lists and RFIs — built for one hand and a dirty glove.',
        advance: 'read',
      },
      {
        title: 'It works with no signal',
        body: 'Everything queues on the phone and syncs when they get back in range. A basement with no bars does not stop the day.',
        advance: 'read',
      },
      nav('/field', 'Field App'),
    ],
  },
  {
    id: 'fleet',
    question: 'How do I track equipment and vehicles?',
    blurb: 'Registry, service history, expiring documents, GPS.',
    category: 'Build it',
    startRoute: '/app/fleet',
    steps: [
      nav('/app/fleet', 'Fleet'),
      {
        title: 'Add an asset',
        body: 'Type the VIN and press Decode — year, make and model fill themselves in from the federal database. Equipment without a VIN takes a serial number instead.',
        route: '/app/fleet',
        anchor: ['[data-tour="add-asset"]'],
        anchorText: ['Add asset'],
        advance: 'click',
      },
      {
        title: 'What it watches',
        body: 'Service intervals by date or odometer, and expiry dates on registration, insurance and warranty. An expired registration found by a state trooper costs more than one found here.',
        route: '/app/fleet',
        advance: 'read',
      },
    ],
  },

  /* ─── Get paid ───────────────────────────────────────────────────────── */
  {
    id: 'budget',
    question: 'How do I set up the budget?',
    blurb: 'CSI cost codes, seeded from your estimate.',
    category: 'Get paid',
    startRoute: '/app/projects',
    steps: [
      nav('/app/projects', 'Projects'),
      OPEN_A_PROJECT,
      projectNav('budget', 'Budget',
        'Original, revised, committed, actual and forecast by CSI cost code — this is job costing, and it is what tells you whether you are making money before the job ends.'),
      {
        title: 'Seed it from the estimate',
        body: 'If you have priced bid packages, each one offers a Seed Line button that carries the number straight in. Otherwise the CSI division chips start you a blank line.',
        anchorText: ['Seed Line', 'Add Line'],
        advance: 'read',
      },
      {
        title: 'Adjusting a line',
        body: 'The Actions menu on any row edits the amount, nudges it by a percentage, or deletes it. Changes flow into the forecast immediately.',
        anchorText: ['Actions'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'pay-app',
    question: 'How do I submit a pay application?',
    blurb: 'Schedule of values, this period, retainage — then send it.',
    category: 'Get paid',
    startRoute: '/app/projects',
    steps: [
      nav('/app/projects', 'Projects'),
      OPEN_A_PROJECT,
      projectNav('pay-apps', 'Pay Applications',
        'An AIA G702/G703 application bills one period against your schedule of values. Saguaro rolls forward everything billed to date.'),
      {
        title: 'Start the application',
        body: 'The period dates are suggested from where the last application ended, and the retainage rate carries over.',
        anchor: ['[data-tour="new-pay-app"]'],
        anchorText: ['New Pay Application', 'Create Application #1'],
        advance: 'click',
      },
      {
        title: 'Build the schedule of values',
        body: 'Step 2 is the SOV: a line per scope with its scheduled value. On the first application you build it; after that it rolls forward and you only type this period.',
        anchorText: ['2. Schedule of Values'],
        advance: 'read',
      },
      {
        title: 'Enter this period only',
        body: 'Previous billings, percent complete, retainage and the balance to finish all calculate themselves. Getting retainage wrong is the most common reason an owner rejects an application — Saguaro uses the rate set on the project.',
        advance: 'read',
      },
      {
        title: 'Draft or send',
        body: 'Save Draft keeps it editable. Submit to Owner locks it and starts the lifecycle: submitted, approved, certified, paid — each one recorded with a date.',
        anchorText: ['Submit to Owner', 'Save Draft'],
        advance: 'read',
      },
      {
        title: 'The PDF',
        body: 'G702/G703 PDF produces the real AIA forms, filled in. That is the document the owner’s architect signs.',
        anchorText: ['G702/G703 PDF'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'change-order',
    question: 'How do I write a change order?',
    blurb: 'Get the extra work approved before you build it.',
    category: 'Get paid',
    startRoute: '/app/projects',
    steps: [
      nav('/app/projects', 'Projects'),
      OPEN_A_PROJECT,
      projectNav('change-orders', 'Change Orders',
        'The CO number is assigned for you. Only the title is required to log one.'),
      {
        title: 'Price it and see the impact',
        body: 'Cost impact previews the new contract sum as you type; schedule impact previews the new completion date. A negative number is a credit.',
        anchorText: ['New Change Order'],
        advance: 'read',
      },
      {
        title: 'Check it before you send',
        body: 'Analyze Risk reads the change order and tells you how likely it is to be approved and what an owner will push back on. Worth thirty seconds on anything large.',
        anchorText: ['Analyze Risk'],
        advance: 'read',
      },
      {
        title: 'Approved work flows everywhere',
        body: 'An approved change order updates the contract sum, the budget line and the next pay application on its own. Unapproved extra work is money you will argue about later.',
        advance: 'read',
      },
    ],
  },
  {
    id: 'invoicing',
    question: 'How do I invoice and get paid?',
    blurb: 'Create it, PDF it, send it, track it.',
    category: 'Get paid',
    startRoute: '/app/invoicing',
    steps: [
      nav('/app/invoicing', 'Invoicing'),
      {
        title: 'Create an invoice',
        body: 'Pick the project and the vendor and Saguaro suggests the invoice number, today’s issue date and net-30 terms.',
        route: '/app/invoicing',
        anchor: ['[data-tour="new-invoice"]'],
        anchorText: ['New Invoice'],
        advance: 'click',
      },
      {
        title: 'PDF, then send',
        body: 'PDF regenerates a fresh link every time — an old one expires, so you never hand somebody a dead URL. Send needs a vendor email on file and will say so plainly rather than pretending it went.',
        route: '/app/invoicing',
        anchorText: ['PDF'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'lien-waivers',
    question: 'How do I handle lien waivers?',
    blurb: 'Generate them, send them, track who has signed.',
    category: 'Get paid',
    startRoute: '/app/documents',
    steps: [
      nav('/app/documents', 'Documents'),
      {
        title: 'Open Lien Waivers',
        body: 'Conditional and unconditional, progress and final — generated against the right state form for the project’s jurisdiction.',
        route: '/app/documents',
        anchor: ['[data-tour="docs-tab-lien-waivers"]'],
        anchorText: ['Lien Waivers'],
        advance: 'click',
      },
      {
        title: 'Why the deadline matters',
        body: 'Waiver deadlines are set by state law, which is why the project address matters. A missed deadline can cost you the lien right entirely — Saguaro tracks the dates off the jurisdiction it read from the address.',
        route: '/app/documents',
        advance: 'read',
      },
    ],
  },

  /* ─── Run the business ───────────────────────────────────────────────── */
  {
    id: 'invite-team',
    question: 'How do I add my crew and office staff?',
    blurb: 'Two different things: employees on the roster, and users with logins.',
    category: 'Run the business',
    startRoute: '/app/people',
    steps: [
      nav('/app/people', 'People & Access'),
      {
        title: 'Two tabs, two jobs',
        body: 'Directory is your crew roster — the people whose hours and certifications you track. Roles & Access is who can sign in and what they can see. A framer might be in one and not the other.',
        route: '/app/people',
        anchorText: ['Directory'],
        advance: 'read',
      },
      {
        title: 'Add someone to the roster',
        body: 'On Directory: name, trade, rate. This is who shows up on timesheets and who you assign to a job.',
        route: '/app/people',
        anchorText: ['Add employee'],
        advance: 'read',
      },
      {
        title: 'Give someone a login',
        body: 'On Roles & Access: Invite User sends an email with a link. They set their own password — you never handle it.',
        route: '/app/people',
        anchorText: ['+ Invite User', 'Invite User'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'roles',
    question: 'How do I control what people can see?',
    blurb: 'Roles, the permission matrix, and per-project scope.',
    category: 'Run the business',
    startRoute: '/app/people',
    steps: [
      nav('/app/people', 'People & Access'),
      {
        title: 'Roles decide everything',
        body: 'A role is a set of permissions — none, view, edit or full — across every module. Field crew see their own hours and the phone app; a PM sees the whole job including money.',
        route: '/app/people',
        anchorText: ['Roles'],
        advance: 'read',
      },
      {
        title: 'Make your own',
        body: 'New Role opens the full permission grid with quick-set buttons, so you can build "Superintendent — everything except financials" in about a minute.',
        route: '/app/people',
        anchorText: ['+ New Role', 'New Role'],
        advance: 'read',
      },
      {
        title: 'Scope it to one job',
        body: 'Assign Role takes an optional project scope. That is how a sub’s PM sees their job and nothing else in your portfolio.',
        route: '/app/people',
        anchorText: ['+ Assign Role', 'Assign Role'],
        advance: 'read',
      },
      {
        title: 'Who changed what',
        body: 'The Audit Log records every permission change with who made it and when. If access is ever questioned, that is the answer.',
        route: '/app/people',
        anchorText: ['Audit Log'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'portals',
    question: 'How do I share a job with the owner or a sub?',
    blurb: 'A portal link — no account needed on their side.',
    category: 'Run the business',
    startRoute: '/app/portals',
    steps: [
      nav('/app/portals', 'Portals'),
      {
        title: 'Invite the owner',
        body: 'A client portal is a read-only window onto one job: progress, photos and the documents you choose. They do not get a Saguaro login and cannot see your costs.',
        route: '/app/portals',
        anchor: ['[data-tour="invite-client"]'],
        anchorText: ['Invite Client', 'Invite First Client'],
        advance: 'click',
      },
      {
        title: 'Subs get their own',
        body: 'A sub portal shows that sub their scope, their documents and their compliance status — not the rest of the job.',
        route: '/app/portals',
        anchorText: ['Invite Subcontractor', 'Invite First Subcontractor'],
        advance: 'read',
      },
      {
        title: 'You can take it back',
        body: 'Every link has an expiry, and Revoke kills it immediately. Access ends when the job does.',
        route: '/app/portals',
        anchorText: ['Revoke'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'compliance',
    question: 'How do I keep sub insurance and W-9s current?',
    blurb: 'A compliance score per sub, and what is expiring.',
    category: 'Run the business',
    startRoute: '/app/compliance',
    steps: [
      nav('/app/compliance', 'Compliance'),
      {
        title: 'How the score works',
        body: 'Each sub is scored out of 100: W-9 on file is 25 points, current insurance is 40, signed lien waivers are 35. At risk and non-compliant are the two filters you actually use.',
        route: '/app/compliance',
        advance: 'read',
      },
      {
        title: 'Chase the gap',
        body: 'Open a sub and you get their email and a link to their project team. An expired certificate of insurance on a sub is a claim you end up carrying.',
        route: '/app/compliance',
        anchorText: ['Details'],
        advance: 'read',
      },
    ],
  },
  {
    id: 'reports',
    question: 'How do I get a report out of this?',
    blurb: 'Ask in plain English, or pick one of the twelve standard reports.',
    category: 'Run the business',
    startRoute: '/app/reports',
    steps: [
      nav('/app/reports', 'Reports'),
      {
        title: 'Just ask',
        body: 'Type what you want — "open RFIs by project", "job cost for the Riverdale job" — and Sage builds it from your real data. The suggestion chips underneath are the common ones.',
        route: '/app/reports',
        anchorText: ['Ask Sage'],
        advance: 'read',
      },
      {
        title: 'Or take a standard one',
        body: 'Twelve built reports: pay app status, job cost, RFI log, change orders, lien waivers, insurance compliance, daily logs, punch list, sub performance, safety, bid packages, timesheets. One click each.',
        route: '/app/reports',
        advance: 'read',
      },
      {
        title: 'Get it out',
        body: 'Any result exports to PDF, Excel, Word or CSV. That is what goes to the bank or the bonding company.',
        route: '/app/reports',
        advance: 'read',
      },
    ],
  },
  {
    id: 'autopilot',
    question: 'What is Autopilot watching for?',
    blurb: 'Overdue RFIs, expiring insurance, budget overruns — found for you.',
    category: 'Run the business',
    startRoute: '/app/autopilot',
    steps: [
      nav('/app/autopilot', 'Autopilot'),
      {
        title: 'Run a scan',
        body: 'It reads every project for overdue RFIs, unpaid invoices, expiring insurance, stale change orders, budget overruns and scope creep — the things that cost money while nobody is looking.',
        route: '/app/autopilot',
        anchor: ['[data-tour="run-scan"]'],
        anchorText: ['Run Scan Now'],
        advance: 'click',
      },
      {
        title: 'Acknowledge or dismiss',
        body: 'Acknowledge means you have seen it and it stays on the list. Dismiss means it is not a problem. Critical and high are the two worth opening first.',
        route: '/app/autopilot',
        advance: 'read',
      },
    ],
  },
  {
    id: 'settings',
    question: 'How do I set up my company details and logo?',
    blurb: 'What prints on every contract and pay application.',
    category: 'Run the business',
    startRoute: '/app/settings',
    steps: [
      nav('/app/settings', 'Settings'),
      {
        title: 'Your details go on documents',
        body: 'Company name, license number and address print on contracts, pay applications and lien waivers. Ten minutes here saves correcting them one document at a time.',
        route: '/app/settings',
        anchorText: ['Save Profile'],
        advance: 'read',
      },
      {
        title: 'Your logo and color',
        body: 'Upload the logo and it appears in the sidebar immediately and on every generated PDF. The brand color replaces Saguaro gold throughout.',
        route: '/app/settings',
        anchorText: ['Save Branding'],
        advance: 'read',
      },
      {
        title: 'Everything else lives here',
        body: 'Notifications, roles, integrations, external storage, custom fields, document templates and Autopilot rules are all one row down this list.',
        route: '/app/settings',
        advance: 'read',
      },
    ],
  },
  {
    id: 'billing',
    question: 'How do I manage my subscription?',
    blurb: 'Plan, payment method, add-ons.',
    category: 'Run the business',
    startRoute: '/app/billing',
    steps: [
      nav('/app/billing', 'Billing'),
      {
        title: 'Plan and payment',
        body: 'Manage Payment & Invoices opens the secure billing portal — card details are handled there, never typed into Saguaro.',
        route: '/app/billing',
        anchorText: ['Manage Payment & Invoices', 'Change Plan'],
        advance: 'read',
      },
      {
        title: 'Add-ons are never auto-charged',
        body: 'Requesting one starts a conversation about price. Nothing is billed until a person confirms it with you.',
        route: '/app/billing',
        advance: 'read',
      },
    ],
  },
];

export function tourById(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id);
}
