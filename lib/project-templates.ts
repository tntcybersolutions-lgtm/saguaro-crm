/**
 * Project templates — one choice that furnishes the whole job.
 *
 * Creating a project used to insert a row and nothing else. Every job started
 * identical and empty: no filing structure, no retainage, no sense of which of
 * the forty-odd tools mattered. The GC had to furnish a blank room before they
 * could work, and that is the difference people are describing when they say a
 * competitor's setup is easier — not the fields on the form, the fact that
 * choosing your kind of job does the setting up for you.
 *
 * A template is deliberately small. It answers four questions a GC would
 * otherwise answer by hand on every job:
 *
 *   how much retainage does this kind of work carry
 *   which CSI divisions should the budget expect
 *   where do documents go
 *   which tools are worth showing on day one
 *
 * Everything a template sets stays editable. It is a starting point, not a
 * lock — the same rule the contract forms follow.
 */

export interface ProjectTemplate {
  key: string;
  name: string;
  blurb: string;
  /** One line a GC can recognize their own job in. */
  example: string;
  projectType: string;
  contractType: string;
  retainagePct: number;
  /** CSI divisions the budget and bid packages should expect. */
  divisions: string[];
  /** The filing structure, laid down empty at creation. */
  folders: string[];
  /** Project-rail tools worth showing before there is any data. */
  tools: string[];
}

/* Folder sets. Most of a filing structure is the same on every job — the
   differences are few and worth stating rather than inventing per template. */
const CORE_FOLDERS = [
  'Drawings',
  'Specifications',
  'Permits & Approvals',
  'Contracts',
  'Submittals',
  'RFIs',
  'Change Orders',
  'Photos',
  'Daily Reports',
  'Invoices & Pay Apps',
  'Closeout',
];

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    key: 'ground-up',
    name: 'Ground-up construction',
    blurb: 'New building from site work to closeout. Full CSI spread, bonded, formal submittals.',
    example: 'A new fire station, medical plaza or commercial shell.',
    projectType: 'commercial',
    contractType: 'Lump Sum',
    retainagePct: 10,
    divisions: ['02', '03', '04', '05', '06', '07', '08', '09', '21', '22', '23', '26', '27', '28', '31', '32', '33'],
    folders: [...CORE_FOLDERS, 'Geotech & Survey', 'Bonds & Insurance'],
    tools: ['/takeoff', '/bid-packages', '/budget', '/schedule', '/submittals', '/rfis', '/daily-logs', '/pay-apps', '/files', '/team'],
  },
  {
    key: 'tenant-improvement',
    name: 'Tenant improvement',
    blurb: 'Interior fit-out inside an existing shell. Finishes and MEP heavy, tight schedule, landlord coordination.',
    example: 'An office suite, clinic build-out or restaurant fit-out.',
    projectType: 'commercial',
    contractType: 'Lump Sum',
    retainagePct: 10,
    divisions: ['02', '06', '08', '09', '21', '22', '23', '26', '27', '28'],
    folders: [...CORE_FOLDERS, 'Landlord Coordination', 'Selections & Finishes'],
    tools: ['/takeoff', '/bid-packages', '/budget', '/schedule', '/selections', '/rfis', '/daily-logs', '/pay-apps', '/files', '/team'],
  },
  {
    key: 'renovation',
    name: 'Renovation / remodel',
    blurb: 'Work inside an occupied or existing building. Demolition first, unknowns expected, allowances matter.',
    example: 'A wing refurbishment, historic restoration or a home remodel.',
    projectType: 'residential',
    contractType: 'Cost Plus',
    retainagePct: 10,
    divisions: ['02', '03', '06', '07', '08', '09', '22', '23', '26'],
    folders: [...CORE_FOLDERS, 'Existing Conditions', 'Selections & Allowances'],
    tools: ['/takeoff', '/budget', '/selections', '/change-orders', '/daily-logs', '/photos', '/pay-apps', '/files', '/team'],
  },
  {
    key: 'service',
    name: 'Service & small works',
    blurb: 'Short jobs billed on time and materials. No bid packages, no retainage, invoice on completion.',
    example: 'A callout, a repair, a small install under a maintenance agreement.',
    projectType: 'service',
    contractType: 'Time & Materials',
    retainagePct: 0,
    divisions: ['22', '23', '26'],
    folders: ['Photos', 'Invoices & Pay Apps', 'Contracts', 'Closeout'],
    tools: ['/tm-tickets', '/daily-logs', '/photos', '/invoices', '/timesheets', '/files', '/team'],
  },
];

export function templateByKey(key: string | null | undefined): ProjectTemplate | null {
  if (!key) return null;
  return PROJECT_TEMPLATES.find((t) => t.key === key) ?? null;
}
