/**
 * The status system — what state is this in, how far through, and what now?
 *
 * A bare status word answers one question. The GC has three:
 *
 *   What state is this in?      the pill
 *   How far through is it?      the rail
 *   What am I supposed to do?   the instruction
 *
 * Procore answers the first and makes you go and find the other two. That is
 * the gap this closes, so the rules below are deliberately strict:
 *
 *   ONE MEANING PER COLOUR, EVERYWHERE. Blue means "someone else has it" on a
 *   pay application, an RFI, a submittal and a purchase order alike. If blue
 *   meant "submitted" on one screen and "in progress" on another, the color
 *   would carry no information and the whole thing is decoration.
 *
 *   NEVER RENDER BLANK. Only `takeoffs` has a CHECK constraint on its status
 *   column — every other table here is free text, so a value nobody planned
 *   for will turn up. An unknown status shows as a neutral pill with the raw
 *   value rather than an empty cell that looks like missing data.
 *
 *   NO RAIL WITHOUT A FLOW. A rail on a two-state field is a lie about how
 *   much process there is. Modules whose stages are real get one; the rest get
 *   a pill only.
 *
 * The status values below were read out of the live database — every distinct
 * value in use across all fourteen tables — plus the ones the code writes but
 * which have no rows yet. They were not invented.
 */

/* ── tone ───────────────────────────────────────────────────────────────── */

/**
 * Six meanings, and only six. Adding a seventh is how a color system dies.
 *
 * The one that earns its keep is `active` versus `waiting`: both are "not
 * finished", but one is on the GC's desk and the other is on somebody else's.
 * That is the single most useful thing a status can tell you on a Monday.
 */
export type Tone =
  /** Yours, not sent. Nobody is waiting on anybody. */
  | 'draft'
  /** YOU are the blocker. This is the one to scan for. */
  | 'active'
  /** Someone else has it. You are waiting; chase it if it goes stale. */
  | 'waiting'
  /** Went well. Approved, passed, signed. */
  | 'good'
  /** Came back needing work. Not dead, but not moving either. */
  | 'warn'
  /** Rejected, failed, overdue. */
  | 'bad'
  /** Finished and closed. Nothing more to do. */
  | 'done';

export interface ToneStyle {
  /** Text and dot color. */
  fg: string;
  /** Pill fill. */
  bg: string;
  /** Pill hairline. */
  border: string;
  /** What this color means, shown on hover. */
  meaning: string;
}

/* Approved palette only (2026-10-12): status colours are the approved green,
   amber and red; "waiting on you" is the info blue, because yellow is kept for
   primary actions and the selected item. */
export const TONES: Record<Tone, ToneStyle> = {
  draft:   { fg: '#94A3B8', bg: 'rgba(148,163,184,0.14)', border: 'rgba(148,163,184,0.40)', meaning: 'Not sent yet — nobody is waiting on this' },
  active:  { fg: '#38BDF8', bg: 'rgba(56,189,248,0.14)',  border: 'rgba(56,189,248,0.45)',  meaning: 'Waiting on you' },
  waiting: { fg: '#FBBF24', bg: 'rgba(251,191,36,0.16)',  border: 'rgba(251,191,36,0.50)',  meaning: 'Waiting on someone else' },
  good:    { fg: '#4ADE80', bg: 'rgba(74,222,128,0.16)',  border: 'rgba(74,222,128,0.50)',  meaning: 'Approved' },
  warn:    { fg: '#FBBF24', bg: 'rgba(251,191,36,0.16)',  border: 'rgba(251,191,36,0.50)',  meaning: 'Came back needing changes' },
  bad:     { fg: '#F87171', bg: 'rgba(248,113,113,0.16)',   border: 'rgba(248,113,113,0.50)',   meaning: 'Rejected or failed' },
  done:    { fg: '#4ADE80', bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.32)',  meaning: 'Closed — nothing left to do' },
};

/* ── modules ────────────────────────────────────────────────────────────── */

export interface StatusDef {
  /** How it reads on screen. Sentence case, never SCREAMING unless short. */
  label: string;
  tone: Tone;
  /**
   * Which stage of the rail this sits at, zero-based. Omit for a status that
   * is off the happy path — rejected, failed — which lights the pill but does
   * not pretend to be a step forward.
   */
  stage?: number;
  /**
   * What the GC should do about it, in the imperative. This is the whole
   * point: "Submitted" is a fact, "Owner has it — chase if it goes quiet" is
   * an instruction. Omitted where there is genuinely nothing to do.
   */
  action?: string;
}

export interface ModuleDef {
  /** Plain-English name of one record, for instructions. */
  noun: string;
  /** Rail stages in order. Empty means pill-only — no invented process. */
  stages: string[];
  /** Every status the table can hold. */
  statuses: Record<string, StatusDef>;
  /**
   * A `waiting` record that has not moved in this many days is going stale and
   * gets nudged. Zero or absent means never nudge.
   */
  staleAfterDays?: number;
}

export const MODULES: Record<string, ModuleDef> = {
  /* Paperwork a sub must have before they can be awarded work: W-9, insurance
     certificate, licence, prequal documents. Pill-only — a document has no
     process rail, it is either in hand, going stale, or gone. */
  /* Generic vocabulary for the status-to-pill codemod and for one-off pills
     where no module applies. Tone follows the word's meaning everywhere. */
  generic: {
    noun: 'item',
    stages: [],
    statuses: {
      missing: { label: 'Missing', tone: 'bad' }, not_on_file: { label: 'Not on File', tone: 'bad' }, on_file: { label: 'On File', tone: 'good' },
      overdue: { label: 'Overdue', tone: 'bad' }, late: { label: 'Late', tone: 'bad' }, on_time: { label: 'On Time', tone: 'good' }, due_today: { label: 'Due Today', tone: 'warn' },
      approved: { label: 'Approved', tone: 'good' }, paid: { label: 'Paid', tone: 'done' }, pending: { label: 'Pending', tone: 'waiting' }, rejected: { label: 'Rejected', tone: 'bad' },
      expired: { label: 'Expired', tone: 'bad' }, expiring: { label: 'Expiring', tone: 'warn' }, draft: { label: 'Draft', tone: 'draft' }, submitted: { label: 'Submitted', tone: 'waiting' },
      sent: { label: 'Sent', tone: 'waiting' }, open: { label: 'Open', tone: 'active' }, closed: { label: 'Closed', tone: 'done' }, active: { label: 'Active', tone: 'good' }, inactive: { label: 'Inactive', tone: 'draft' },
      complete: { label: 'Complete', tone: 'done' }, completed: { label: 'Completed', tone: 'done' }, done: { label: 'Done', tone: 'done' }, in_progress: { label: 'In Progress', tone: 'active' }, under_review: { label: 'Under Review', tone: 'waiting' },
      signed: { label: 'Signed', tone: 'good' }, unsigned: { label: 'Unsigned', tone: 'warn' }, certified: { label: 'Certified', tone: 'good' }, verified: { label: 'Verified', tone: 'good' }, unverified: { label: 'Unverified', tone: 'warn' },
      declined: { label: 'Declined', tone: 'bad' }, cancelled: { label: 'Cancelled', tone: 'bad' }, canceled: { label: 'Canceled', tone: 'bad' }, awarded: { label: 'Awarded', tone: 'good' }, won: { label: 'Won', tone: 'good' }, lost: { label: 'Lost', tone: 'bad' },
      not_started: { label: 'Not Started', tone: 'draft' }, scheduled: { label: 'Scheduled', tone: 'waiting' },
    },
  },
  paperwork: {
    noun: 'document',
    stages: [],
    statuses: {
      on_file:     { label: 'On File',     tone: 'good' },
      active:      { label: 'Active',      tone: 'good' },
      verified:    { label: 'Verified',    tone: 'good' },
      current:     { label: 'Current',     tone: 'good' },
      pending:     { label: 'Pending',     tone: 'waiting', action: 'Requested — waiting on the sub' },
      expiring:    { label: 'Expiring',    tone: 'warn',    action: 'Expires within 30 days — ask for the renewal now' },
      expired:     { label: 'Expired',     tone: 'bad',     action: 'Lapsed — nothing can be awarded until it is renewed' },
      missing:     { label: 'Missing',     tone: 'bad',     action: 'Not on file — request it before award' },
      not_on_file: { label: 'Not on File', tone: 'bad',     action: 'Not on file — request it before award' },
    },
  },
  bills: {
    noun: 'bill',
    stages: ['Pending', 'Approved', 'Paid'],
    staleAfterDays: 14,
    statuses: {
      draft:    { label: 'Draft',    tone: 'draft',   stage: 0 },
      pending:  { label: 'Pending',  tone: 'waiting', stage: 0, action: 'Waiting on approval' },
      approved: { label: 'Approved', tone: 'good',    stage: 1, action: 'Approved — schedule the payment' },
      paid:     { label: 'Paid',     tone: 'done',    stage: 2 },
      overdue:  { label: 'Overdue',  tone: 'bad',               action: 'Past due — pay it or dispute it' },
      disputed: { label: 'Disputed', tone: 'warn',              action: 'In dispute with the vendor' },
    },
  },
  contracts: {
    noun: 'contract',
    stages: ['Draft', 'Sent', 'Executed', 'Complete'],
    staleAfterDays: 7,
    statuses: {
      draft:    { label: 'Draft',    tone: 'draft',   stage: 0, action: 'Finish the terms and send it' },
      sent:     { label: 'Sent',     tone: 'waiting', stage: 1, action: 'Out for signature' },
      executed: { label: 'Executed', tone: 'good',    stage: 2 },
      active:   { label: 'Active',   tone: 'good',    stage: 2 },
      complete: { label: 'Complete', tone: 'done',    stage: 3 },
      expired:  { label: 'Expired',  tone: 'bad' },
      terminated: { label: 'Terminated', tone: 'bad' },
    },
  },
  network_devices: {
    noun: 'device',
    stages: [],
    statuses: {
      online:      { label: 'Online',      tone: 'good' },
      offline:     { label: 'Offline',     tone: 'bad',     action: 'Down — check power and uplink' },
      planned:     { label: 'Planned',     tone: 'draft' },
      warning:     { label: 'Warning',     tone: 'warn' },
      maintenance: { label: 'Maintenance', tone: 'waiting' },
    },
  },
  portal_users: {
    noun: 'portal user',
    stages: [],
    statuses: {
      active:   { label: 'Active',   tone: 'good' },
      pending:  { label: 'Pending',  tone: 'waiting', action: 'Invited — waiting on them to sign in' },
      disabled: { label: 'Disabled', tone: 'bad' },
    },
  },
  resource_assignments: {
    noun: 'assignment',
    stages: [],
    statuses: {
      assigned:    { label: 'Assigned',    tone: 'active' },
      tentative:   { label: 'Tentative',   tone: 'waiting' },
      confirmed:   { label: 'Confirmed',   tone: 'good' },
      released:    { label: 'Released',    tone: 'draft' },
      unavailable: { label: 'Unavailable', tone: 'bad' },
    },
  },
  customers: {
    noun: 'customer',
    stages: ['Lead', 'Qualified', 'Proposal', 'Customer'],
    statuses: {
      lead:      { label: 'Lead',      tone: 'active',  stage: 0, action: 'New — qualify them' },
      qualified: { label: 'Qualified', tone: 'waiting', stage: 1, action: 'Qualified — get a proposal out' },
      proposal:  { label: 'Proposal',  tone: 'waiting', stage: 2, action: 'Proposal out — follow up' },
      customer:  { label: 'Customer',  tone: 'good',    stage: 3 },
      lost:      { label: 'Lost',      tone: 'bad' },
    },
  },
  team_access: {
    noun: 'member',
    stages: [],
    statuses: {
      admin:   { label: 'Admin',   tone: 'active' },
      manager: { label: 'Manager', tone: 'waiting' },
      member:  { label: 'Member',  tone: 'draft' },
      client:  { label: 'Client',  tone: 'good' },
      guest:   { label: 'Guest',   tone: 'draft' },
      'sub portal': { label: 'Sub Portal', tone: 'waiting' },
    },
  },
  compliance: {
    noun: 'subcontractor',
    stages: [],
    statuses: {
      compliant:     { label: 'Compliant',     tone: 'good' },
      at_risk:       { label: 'At Risk',       tone: 'warn', action: 'Something is expiring or unsigned — chase it before award' },
      non_compliant: { label: 'Non-Compliant', tone: 'bad',  action: 'Cannot be awarded or paid until the paperwork is in' },
    },
  },
  prequalification: {
    noun: 'prequalification',
    stages: ['Pending', 'Under review', 'Approved'],
    staleAfterDays: 10,
    statuses: {
      pending:      { label: 'Pending',      tone: 'waiting', stage: 0, action: 'Sent — waiting on the sub to submit' },
      under_review: { label: 'Under review', tone: 'active',  stage: 1, action: 'Submitted — review and decide' },
      approved:     { label: 'Approved',     tone: 'good',    stage: 2 },
      rejected:     { label: 'Rejected',     tone: 'bad',               action: 'Rejected — tell the sub what fell short' },
      expired:      { label: 'Expired',      tone: 'bad',               action: 'Lapsed — ask for a fresh package' },
    },
  },
  pay_applications: {
    noun: 'pay application',
    stages: ['Draft', 'Submitted', 'Approved', 'Certified', 'Paid'],
    staleAfterDays: 7,
    statuses: {
      draft:     { label: 'Draft',     tone: 'draft',   stage: 0, action: 'Finish the schedule of values and submit it' },
      submitted: { label: 'Submitted', tone: 'waiting', stage: 1, action: 'With the owner for review' },
      approved:  { label: 'Approved',  tone: 'good',    stage: 2, action: 'Waiting on the architect to certify' },
      certified: { label: 'Certified', tone: 'good',    stage: 3, action: 'Certified — payment is due' },
      paid:      { label: 'Paid',      tone: 'done',    stage: 4 },
      rejected:  { label: 'Rejected',  tone: 'bad',               action: 'Fix what the owner flagged and resubmit' },
    },
  },

  /* A sub's invoice filed from the sub portal (portal_sub_pay_apps), as the GC moves it along. */
  sub_invoices: {
    noun: 'sub invoice',
    stages: ['Submitted', 'Under review', 'Approved', 'Paid'],
    staleAfterDays: 5,
    statuses: {
      submitted:    { label: 'Submitted',    tone: 'waiting', stage: 0, action: 'Waiting on your review' },
      under_review: { label: 'Under review', tone: 'waiting', stage: 1, action: 'Check the lines, then approve or send it back' },
      approved:     { label: 'Approved',     tone: 'good',    stage: 2, action: 'Approved — the sub can sign a conditional waiver; pay it, then mark it paid' },
      paid:         { label: 'Paid',         tone: 'done',    stage: 3 },
      rejected:     { label: 'Sent back',    tone: 'bad',               action: 'Sent back to the sub with your reason' },
    },
  },

  /* An email Saguaro sent (communication_log.status). */
  emails: {
    noun: 'email',
    stages: [],
    statuses: {
      sent:     { label: 'Sent',     tone: 'good', action: 'Handed to the mail service' },
      failed:   { label: 'Failed',   tone: 'bad',  action: "Didn't send — check the address and send it again" },
      not_sent: { label: 'Not sent', tone: 'warn', action: "Email isn't set up on this account, so nothing left Saguaro" },
    },
  },

  change_orders: {
    noun: 'change order',
    stages: ['Draft', 'Priced', 'Submitted', 'Review', 'Approved'],
    staleAfterDays: 10,
    statuses: {
      draft:             { label: 'Draft',            tone: 'draft',   stage: 0, action: 'Price it and send it before the work starts' },
      pricing:           { label: 'Pricing',          tone: 'active',  stage: 1, action: 'Price the change so it can go out' },
      submitted:         { label: 'Submitted',        tone: 'waiting', stage: 2, action: 'Sent — waiting on a decision' },
      pm_review:         { label: 'PM review',        tone: 'waiting', stage: 3, action: 'With the project manager' },
      architect_review:  { label: 'Architect review', tone: 'waiting', stage: 3, action: 'With the architect' },
      pending:           { label: 'Pending',          tone: 'waiting', stage: 3, action: 'Awaiting a decision' },
      pending_owner:     { label: 'Owner review',     tone: 'waiting', stage: 3, action: 'With the owner' },
      approved:          { label: 'Approved',         tone: 'good',    stage: 4, action: 'Approved — the contract sum and budget have moved' },
      rejected:          { label: 'Rejected',         tone: 'bad',               action: 'Rejected — do not build this scope' },
    },
  },

  rfis: {
    noun: 'RFI',
    stages: ['Draft', 'Open', 'Under review', 'Answered', 'Closed'],
    staleAfterDays: 7,
    statuses: {
      draft:        { label: 'Draft',        tone: 'draft',   stage: 0, action: 'Finish the question and send it' },
      open:         { label: 'Open',         tone: 'active',  stage: 1, action: 'Send it to whoever can answer' },
      submitted:    { label: 'Submitted',    tone: 'waiting', stage: 2, action: 'Sent — waiting on an answer' },
      pending:      { label: 'Pending',      tone: 'waiting', stage: 2, action: 'Waiting on an answer' },
      under_review: { label: 'Under review', tone: 'waiting', stage: 2, action: 'Being answered' },
      answered:     { label: 'Answered',     tone: 'good',    stage: 3, action: 'Answered — read it and close it out' },
      closed:       { label: 'Closed',       tone: 'done',    stage: 4 },
    },
  },

  submittals: {
    noun: 'submittal',
    stages: ['Draft', 'Submitted', 'Under review', 'Approved'],
    staleAfterDays: 14,
    statuses: {
      draft:               { label: 'Draft',           tone: 'draft',   stage: 0, action: 'Attach the product data and submit' },
      pending:             { label: 'Pending',         tone: 'waiting', stage: 1, action: 'Waiting on review' },
      submitted:           { label: 'Submitted',       tone: 'waiting', stage: 1, action: 'With the architect' },
      under_review:        { label: 'Under review',    tone: 'waiting', stage: 2, action: 'Being reviewed' },
      approved:            { label: 'Approved',        tone: 'good',    stage: 3, action: 'Approved — release it for fabrication' },
      approved_as_noted:   { label: 'Approved as noted', tone: 'good',  stage: 3, action: 'Approved with notes — read them before ordering' },
      revise_and_resubmit: { label: 'Revise & resubmit', tone: 'warn',            action: 'Came back for changes — revise and send again' },
      resubmit:            { label: 'Resubmit',        tone: 'warn',              action: 'Send it again with the corrections' },
      rejected:            { label: 'Rejected',        tone: 'bad',               action: 'Rejected — this product will not be accepted' },
    },
  },

  invoices: {
    noun: 'invoice',
    stages: ['Draft', 'Sent', 'Approved', 'Paid'],
    staleAfterDays: 30,
    statuses: {
      draft:    { label: 'Draft',    tone: 'draft',   stage: 0, action: 'Finish it and send it' },
      pending:  { label: 'Pending',  tone: 'waiting', stage: 1, action: 'Waiting on approval' },
      sent:     { label: 'Sent',     tone: 'waiting', stage: 1, action: 'Sent — waiting to be paid' },
      approved: { label: 'Approved', tone: 'good',    stage: 2, action: 'Approved — payment should follow' },
      paid:     { label: 'Paid',     tone: 'done',    stage: 3 },
      overdue:  { label: 'Overdue',  tone: 'bad',               action: 'Past due — chase the payment' },
    },
  },

  bid_packages: {
    noun: 'bid package',
    stages: ['Draft', 'Out for bid', 'Leveling', 'Awarded'],
    staleAfterDays: 14,
    statuses: {
      draft:    { label: 'Draft',       tone: 'draft',   stage: 0, action: 'Finish the scope and send it to subs' },
      open:     { label: 'Out for bid', tone: 'waiting', stage: 1, action: 'Out with subs — waiting on numbers' },
      sent:     { label: 'Sent',        tone: 'waiting', stage: 1, action: 'Sent — waiting on numbers' },
      leveling: { label: 'Leveling',    tone: 'active',  stage: 2, action: 'Compare the bids on the same scope' },
      awarded:  { label: 'Awarded',     tone: 'good',    stage: 3, action: 'Awarded — get the contract and insurance in' },
      closed:   { label: 'Closed',      tone: 'done',    stage: 3 },
    },
  },

  /* One bidder on a bid package — read as response_status, then status
     (lib/bid-invite-state). */
  bid_package_invites: {
    noun: 'invitation',
    stages: ['Invited', 'Viewed', 'Answered'],
    staleAfterDays: 5,
    statuses: {
      suggested: { label: 'Suggested', tone: 'draft',   stage: 0, action: 'Not invited yet' },
      invited:   { label: 'Invited',   tone: 'waiting', stage: 0, action: 'Has not opened the jacket yet' },
      viewed:    { label: 'Viewed',    tone: 'active',  stage: 1, action: 'Opened the jacket — no bid yet' },
      submitted: { label: 'Bid In',    tone: 'good',    stage: 2 },
      declined:  { label: 'Declined',  tone: 'bad',     stage: 2, action: 'Not bidding — consider another sub' },
      revoked:   { label: 'Revoked',   tone: 'draft',             action: 'Link cut off — it no longer opens the jacket' },
    },
  },

  purchase_orders: {
    noun: 'purchase order',
    stages: ['Draft', 'Sent', 'Received', 'Closed'],
    staleAfterDays: 21,
    statuses: {
      draft:        { label: 'Draft',        tone: 'draft',   stage: 0, action: 'Send it to the vendor' },
      sent:         { label: 'Sent',         tone: 'waiting', stage: 1, action: 'With the vendor' },
      acknowledged: { label: 'Acknowledged', tone: 'waiting', stage: 1, action: 'Vendor has it — waiting on delivery' },
      received:     { label: 'Received',     tone: 'good',    stage: 2, action: 'Delivered — check it against the order' },
      closed:       { label: 'Closed',       tone: 'done',    stage: 3 },
      cancelled:    { label: 'Cancelled',    tone: 'bad' },
    },
  },

  lien_waivers: {
    noun: 'lien waiver',
    stages: ['Required', 'Sent', 'Signed'],
    staleAfterDays: 10,
    statuses: {
      required: { label: 'Required', tone: 'active',  stage: 0, action: 'Generate and send it — payment should not go out first' },
      draft:    { label: 'Draft',    tone: 'draft',   stage: 0, action: 'Finish it and send it' },
      pending:  { label: 'Pending',  tone: 'waiting', stage: 1, action: 'Waiting on a signature' },
      sent:     { label: 'Sent',     tone: 'waiting', stage: 1, action: 'With the sub for signature' },
      signed:   { label: 'Signed',   tone: 'good',    stage: 2, action: 'Signed — safe to release payment' },
      received: { label: 'Received', tone: 'good',    stage: 2, action: 'Received — safe to release payment' },
    },
  },

  daily_logs: {
    noun: 'daily log',
    stages: ['Draft', 'Submitted'],
    statuses: {
      draft:     { label: 'Draft',     tone: 'draft', stage: 0, action: 'Finish today’s log — it is the record that settles a claim' },
      submitted: { label: 'Submitted', tone: 'done',  stage: 1 },
    },
  },

  takeoffs: {
    noun: 'takeoff',
    stages: ['Pending', 'Uploaded', 'Analyzing', 'Complete'],
    statuses: {
      pending:   { label: 'Pending',   tone: 'draft',  stage: 0, action: 'Upload the plan set' },
      uploaded:  { label: 'Uploaded',  tone: 'active', stage: 1, action: 'Ready — start the analysis' },
      analyzing: { label: 'Analyzing', tone: 'active', stage: 2, action: 'Reading the drawings — a minute or two' },
      complete:  { label: 'Complete',  tone: 'good',   stage: 3, action: 'Priced — review it and build the bid' },
      failed:    { label: 'Failed',    tone: 'bad',              action: 'Analysis failed — check the file and try again' },
    },
  },

  inspections: {
    noun: 'inspection',
    /* Two stages, not three. An "Inspected" step sat between these and no
       status could ever reach it — a dot on every row that was structurally
       incapable of filling. An inspection is booked, then it passes or it
       fails; there is no state in between that anyone records. */
    stages: ['Scheduled', 'Passed'],
    staleAfterDays: 7,
    statuses: {
      pending:   { label: 'Pending',   tone: 'waiting', stage: 0, action: 'Booked — waiting on the inspector' },
      scheduled: { label: 'Scheduled', tone: 'waiting', stage: 0, action: 'Booked — waiting on the inspector' },
      passed:    { label: 'Passed',    tone: 'good',    stage: 1, action: 'Passed — carry on' },
      failed:    { label: 'Failed',    tone: 'bad',               action: 'Failed — fix the items and rebook' },
    },
  },

  timesheets: {
    noun: 'timesheet',
    stages: ['Draft', 'Submitted', 'Approved', 'Paid'],
    staleAfterDays: 5,
    statuses: {
      draft:     { label: 'Draft',     tone: 'draft',   stage: 0, action: 'Submit the week for approval' },
      submitted: { label: 'Submitted', tone: 'waiting', stage: 1, action: 'Waiting on approval' },
      approved:  { label: 'Approved',  tone: 'good',    stage: 2, action: 'Approved — ready for payroll' },
      paid:      { label: 'Paid',      tone: 'done',    stage: 3 },
      rejected:  { label: 'Rejected',  tone: 'bad',               action: 'Sent back — fix the hours and resubmit' },
    },
  },

  safety_incidents: {
    noun: 'incident',
    stages: ['Open', 'Under review', 'Closed'],
    staleAfterDays: 3,
    statuses: {
      open:         { label: 'Open',         tone: 'bad',     stage: 0, action: 'Open incident — investigate and record what was done' },
      under_review: { label: 'Under review', tone: 'waiting', stage: 1, action: 'Being investigated' },
      closed:       { label: 'Closed',       tone: 'done',    stage: 2 },
    },
  },

  warranty_claims: {
    noun: 'warranty claim',
    stages: ['Open', 'In progress', 'Resolved'],
    staleAfterDays: 14,
    statuses: {
      open:        { label: 'Open',        tone: 'active',  stage: 0, action: 'Assign someone and get it moving' },
      in_progress: { label: 'In progress', tone: 'waiting', stage: 1, action: 'Being worked' },
      resolved:    { label: 'Resolved',    tone: 'good',    stage: 2, action: 'Resolved — confirm with the owner' },
      closed:      { label: 'Closed',      tone: 'done',    stage: 2 },
    },
  },
};

export type ModuleKey = keyof typeof MODULES;

/* ── resolution ─────────────────────────────────────────────────────────── */

export interface ResolvedStatus {
  label: string;
  tone: Tone;
  style: ToneStyle;
  /** Rail position, or null for a status that is off the happy path. */
  stage: number | null;
  stages: string[];
  action?: string;
  /** True when the raw value is not one we know — shown, not hidden. */
  unknown: boolean;
}

/** Title Case from a snake_case value, for statuses nobody declared. */
function humanise(raw: string): string {
  const s = raw.replace(/[_-]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : 'Unknown';
}

export function resolveStatus(module: string, rawStatus: string | null | undefined): ResolvedStatus {
  const mod = MODULES[module];
  const key = (rawStatus ?? '').toLowerCase().trim();
  const def = mod?.statuses[key];

  if (!def) {
    /* Only takeoffs constrains its status column; everywhere else the value is
       free text, so something unplanned will eventually arrive. Show it rather
       than rendering an empty cell that reads as missing data. */
    return {
      label: key ? humanise(key) : 'No status',
      tone: 'draft',
      style: TONES.draft,
      stage: null,
      stages: mod?.stages ?? [],
      unknown: true,
    };
  }

  return {
    label: def.label,
    tone: def.tone,
    style: TONES[def.tone],
    stage: def.stage ?? null,
    stages: mod?.stages ?? [],
    action: def.action,
    unknown: false,
  };
}

/**
 * Has this been sitting in someone else's court too long?
 *
 * Only `waiting` goes stale — a draft is nobody's fault but yours, and a closed
 * record is finished. Returns the number of days it has been waiting once it is
 * over the line, so the UI can say "6 days" rather than just "stale".
 */
export function staleDays(
  module: string,
  rawStatus: string | null | undefined,
  since: string | Date | null | undefined,
  now: Date,
): number | null {
  const mod = MODULES[module];
  if (!mod?.staleAfterDays || !since) return null;
  const res = resolveStatus(module, rawStatus);
  if (res.tone !== 'waiting') return null;
  const t = since instanceof Date ? since.getTime() : Date.parse(String(since));
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  return days >= mod.staleAfterDays ? days : null;
}
