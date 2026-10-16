/**
 * Module identity accents — the designated color per module, platform-wide.
 * MIRROR of D:/saguaro-web/lib/module-identity.ts — keep byte-identical.
 *
 * Discipline (no rainbow): the accent colors ONLY the module's icon chip,
 * count badges, active states, and section markers. Body text stays in the
 * neutral ramp; gold remains the money + primary-action color.
 * Palette = Sonoran family, every hue tuned for the dark ground.
 *
 * `vivid` is the chip-scale voice of the same hue: a saturated, deeper-ground
 * variant hand-tuned to sit UNDER a white/near-white (#F8FAFC) glyph — never
 * hue-on-hue. Chips and medallions only; prose never colorizes.
 */

export interface ModuleAccent {
  key: string;
  name: string;
  hex: string;    // icon / badge ink
  soft: string;   // ~12% tint chip fill
  ring: string;   // ~45% tint chip ring
  vivid?: string; // saturated chip ground — a WHITE glyph rides ON this color
}

const A = (key: string, name: string, hex: string, vivid: string): ModuleAccent => ({
  key, name, hex, soft: hex + '1F', ring: hex + '73', vivid,
});

export const MODULE_ACCENTS: Record<string, ModuleAccent> = Object.fromEntries([
  // Field
  A('daily',      'Daily Logs',       '#E8B04B', '#FF8A00'), // sun amber
  A('photos',     'Photos',           '#FF8A00', '#FF8A00'), // steel blue
  A('punch',      'Punch List',       '#C96F5E', '#E2593F'), // terracotta
  A('rfis',       'RFIs',             '#FF8A00', '#FF8A00'), // slate violet
  A('time',       'Time Clock',       '#2CFF7A', '#2CFF7A'), // agave
  A('deliveries', 'Deliveries',       '#D98E5C', '#EA7A2E'), // copper
  A('safety',     'Safety',           '#FF3B30', '#FF3B30'), // signal red-clay
  A('inspections','Inspections',      '#8FB3A9', '#2CFF7A'), // patina
  // Execution
  A('schedule',   'Schedule',         '#2CFF7A', '#2CFF7A'), // sage
  A('drawings',   'Drawings',         '#A1A1AA', '#FF8A00'), // blueprint blue
  A('specs',      'Specs',            '#A9A2C4', '#FF8A00'), // lavender gray
  A('documents',  'Documents',        '#B8A98A', '#FF8A00'), // parchment
  A('permits',    'Permits',          '#C7A97F', '#D69E2E'), // sandstone
  A('todos',      'To-Dos',           '#8FB3A9', '#2CFF7A'), // patina
  A('messages',   'Messages',         '#FF8A00', '#FF8A00'), // steel blue
  A('radio',      'Saguaro Radio',    '#E8FF2A', '#FF8A00'), // brand gold-hi (comms flagship)
  // Money (gold family — money stays gold)
  A('payapps',    'Pay Applications', '#E8FF2A', '#FF8A00'),
  A('budget',     'Budget',           '#E8B04B', '#FF8A00'),
  A('invoices',   'Invoices',         '#E8FF2A', '#FF8A00'),
  A('bills',      'Bills',            '#E8FF2A', '#D9A431'),
  A('changeorders','Change Orders',   '#E0A63C', '#E8930C'),
  A('contracts',  'Contracts',        '#E8FF2A', '#D9A431'),
  A('waivers',    'Lien Waivers',     '#C7A97F', '#D69E2E'),
  // Preconstruction
  A('takeoff',    'Takeoff Studio',   '#E8B04B', '#FF8A00'),
  A('signal',     'Signal Studio',    '#E8FF2A', '#FF8A00'),
  A('bids',       'Bids',             '#FF3B30', '#E2566E'), // desert rose
  A('estimates',  'Estimates',        '#D98E5C', '#EA7A2E'),
  A('catalog',    'Materials Catalog','#B8A98A', '#FF8A00'),
  // People
  A('subs',       'Subcontractors',   '#2CFF7A', '#2CFF7A'),
  A('team',       'Team',             '#FF8A00', '#FF8A00'),
  A('compliance', 'Compliance',       '#8FB3A9', '#2CFF7A'),
  // Cross-project + workforce
  A('work',       'My Day',           '#FF8A00', '#FF8A00'), // turquoise — the personal cross-project hub
  A('crews',      'Crews',            '#FF8A00', '#FF8A00'), // workforce orange (mobile tools family)
  A('tm',         'T&M Tickets',      '#84BF8E', '#2CFF7A'), // ledger green — money-adjacent, never gold

  // ── The other 69 modules ────────────────────────────────────────────────
  // Until these existed, moduleAccent() fell through to the grey FALLBACK for
  // most of the app, so ~57 screens COULD NOT be given an identity even when a
  // developer tried — and Equipment shipped wearing the Crews orange as a
  // workaround. Every module now owns a hue in the Sonoran family. Rules kept:
  // money stays gold, safety-critical stays red-clay, and siblings share a
  // family while staying distinguishable at chip scale.

  // Preconstruction / bidding — desert rose family
  A('bidpackages',    'Bid Packages',       '#D4909A', '#E2566E'),
  A('bidintelligence','Bid Intelligence',   '#BE8FA8', '#C2549A'),
  A('bidleveling',    'Bid Leveling',       '#C79BAF', '#D1568C'),

  // Money — gold and ledger-green family
  A('commitments',    'Commitments',        '#E8FF2A', '#D9A431'),
  A('directcosts',    'Direct Costs',       '#E0A63C', '#E8930C'),
  A('financials',     'Financials',         '#E8FF2A', '#FF8A00'),
  A('changeevents',   'Change Events',      '#E0A63C', '#E8930C'),
  A('costcodes',      'Cost Codes',         '#E8FF2A', '#D9A431'),
  A('certifiedpayroll','Certified Payroll', '#84BF8E', '#2CFF7A'),
  A('resourceplanning','Resource Planning', '#2CFF7A', '#2CFF7A'),

  // Execution / correspondence — blueprint + indigo family
  A('submittals',     'Submittals',         '#8FA8D9', '#FF8A00'),
  A('meetings',       'Meetings',           '#FF8A00', '#FF8A00'),
  A('correspondence', 'Correspondence',     '#A8B0C7', '#7C8FE0'),
  A('transmittals',   'Transmittals',       '#9BA8C4', '#6D83D6'),
  A('instructions',   'Instructions',       '#8FA3B8', '#5B8DEF'),
  A('coordination',   'Coordination',       '#8FB3C7', '#FF8A00'),
  A('forms',          'Forms',              '#B8A98A', '#FF8A00'),
  A('actionplans',    'Action Plans',       '#9FA8C4', '#FF8A00'),

  // Field observation — red-clay + patina family
  A('fieldissues',    'Field Issues',       '#D97E6A', '#F0653F'),
  A('observations',   'Observations',       '#9FB8A0', '#2CFF7A'),
  A('closeout',       'Closeout',           '#8CC0A8', '#2CFF7A'),
  A('warranty',       'Warranty',           '#CFA96B', '#FF8A00'),
  A('selections',     'Selections',         '#C79BB0', '#FF8A00'),
  A('insurance',      'Insurance',          '#93B8B0', '#2CFF7A'),

  // Assets & workforce — copper family (Equipment finally owns its own hue)
  A('equipment',      'Equipment',          '#D9A05C', '#EA8C1E'),
  A('fleet',          'Fleet',              '#CE9A63', '#E08A2A'),
  A('fleetasset',     'Fleet Asset',        '#CE9A63', '#E08A2A'),
  A('people',         'People',             '#FF8A00', '#FF8A00'),
  A('contacts',       'Contacts',           '#A1A1AA', '#FF8A00'),
  A('employeedetail', 'Employee',           '#FF8A00', '#FF8A00'),
  A('approvals',      'Approvals',          '#A9B87F', '#2CFF7A'),

  // Command center — one coherent teal→indigo family, distinguishable at chip scale
  A('commandcenter',  'Command Center',     '#FF8A00', '#FF8A00'),
  A('ccchecklists',   'Checklists',         '#6FB3B8', '#0FA8B8'),
  A('ccescalations',  'Escalations',        '#D97E6A', '#F0653F'),
  A('cckpis',         'KPIs',               '#7FB0C4', '#1FA2D6'),
  A('cclonglead',     'Long Lead',          '#A1A1AA', '#FF8A00'),
  A('ccmilestones',   'Milestones',         '#2CFF7A', '#2CFF7A'),
  A('ccoac',          'OAC Meetings',       '#FF8A00', '#FF8A00'),
  A('ccownerupdates', 'Owner Updates',      '#A9A2C4', '#FF8A00'),
  A('ccportals',      'Portals',            '#8FB3C7', '#FF8A00'),
  A('ccpresite',      'Pre-Site',           '#C7A97F', '#D69E2E'),
  A('ccqc',           'Quality Control',    '#8FB3A9', '#2CFF7A'),
  A('ccrisks',        'Risks',              '#FF3B30', '#FF3B30'),
  A('ccrollout',      'Rollout',            '#9FA8C4', '#FF8A00'),
  A('ccvendors',      'Vendors',            '#D9A05C', '#EA8C1E'),
  A('ccverify',       'Verification',       '#8CC0A8', '#2CFF7A'),
  A('franchiserollout','Franchise Rollout', '#9FA8C4', '#FF8A00'),

  // Intelligence & assistants
  A('sage',           'Sage',               '#FF8A00', '#FF8A00'),
  A('autopilot',      'Autopilot',          '#7FB0C4', '#1FA2D6'),
  A('askdocs',        'Ask Docs',           '#A9A2C4', '#FF8A00'),
  A('voice',          'Voice Notes',        '#FF8A00', '#FF8A00'),
  A('reports',        'Reports',            '#B8A98A', '#FF8A00'),
  A('scheduledreports','Scheduled Reports', '#B8A98A', '#FF8A00'),
  A('portfolio',      'Portfolio',          '#FF8A00', '#FF8A00'),

  // Models & plan tools
  A('bim',            'BIM',                '#A1A1AA', '#FF8A00'),
  A('bimviewer',      'BIM Viewer',         '#A1A1AA', '#FF8A00'),

  // Platform / system surfaces
  A('notifications',  'Notifications',      '#C7A97F', '#D69E2E'),
  A('search',         'Search',             '#A1A1AA', '#FF8A00'),
  A('bookmarks',      'Bookmarks',          '#C7A97F', '#D69E2E'),
  A('syncqueue',      'Sync Queue',         '#8FB3A9', '#2CFF7A'),
  A('newproject',     'New Project',        '#2CFF7A', '#2CFF7A'),
  A('w9',             'W-9',                '#B8A98A', '#FF8A00'),
].map((a) => [a.key, a]));

const FALLBACK = A('default', 'Module', '#D4D4D8', '#A3ACBB');
const UNIFORM = A('brand', 'Brand', '#E8FF2A', '#FF8A00'); // vivid ground carries a WHITE glyph — orange, not yellow, for contrast

/** Accent for a module key (route-ish string ok: '/daily', 'punch-list'...). */
export function moduleAccent(key?: string | null): ModuleAccent {
  if (!key) return FALLBACK;
  const k = String(key).toLowerCase().replace(/^\//, '').replace(/[-_\s]/g, '');
  const alias: Record<string, string> = {
    dailylogs: 'daily', dailylog: 'daily', punchlist: 'punch', rfi: 'rfis',
    timeclock: 'time', payapplications: 'payapps', payapp: 'payapps',
    changeorder: 'changeorders', lienwaivers: 'waivers', materialscatalog: 'catalog',
    subcontractors: 'subs', signalstudio: 'signal', takeoffstudio: 'takeoff',
    conversations: 'messages', saguaroradio: 'radio',
    // Route names that are the SAME module under another door — aliasing keeps
    // one identity per concept instead of two near-identical colors.
    measuredtakeoff: 'takeoff', coverageheatmap: 'signal', signaladvisor: 'signal',
    materials: 'catalog', costcatalog: 'catalog',
    primecontracts: 'contracts', contract: 'contracts',
    myitems: 'work', mywork: 'work',
    payapps: 'payapps', invoicing: 'invoices', invoice: 'invoices',
    dailies: 'daily', punchitems: 'punch', submittal: 'submittals',
    meeting: 'meetings', observation: 'observations', fieldissue: 'fieldissues',
    tmtickets: 'tm', tickets: 'tm', employees: 'people', directory: 'people',
  };
  const kk = alias[k] || k;
  // Uniform job palette (owner 2026-10-03): every module wears the ONE brand
  // accent — no per-module rainbow. Key/name are kept for callers that read them.
  const known = MODULE_ACCENTS[kk] || FALLBACK;
  return { ...UNIFORM, key: known.key, name: known.name };
}
