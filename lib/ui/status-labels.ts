/**
 * What the app says it is doing, in the same words everywhere.
 *
 * describeRequest('POST', '/api/projects/<id>/daily-logs/create') →
 *   { doing: 'Saving daily log', done: 'Daily log saved', failed: "Couldn't save daily log" }
 *
 * Derived from the route: the last action word (send, approve, generate…)
 * picks the verb, the resource word before it picks the noun, ids are skipped.
 * Background traffic (presence, auth, telemetry, chat streams, the internals of
 * an upload) is silent — it is not something the person did.
 */

export interface StatusWords { doing: string; done: string; failed: string }

/** Matched against the path after /api/. */
const SILENT: RegExp[] = [
  /^auth\//, /(^|\/)presence(\/|$)/, /(^|\/)heartbeat(\/|$)/, /(^|\/)telemetry/, /(^|\/)analytics/,
  /(^|\/)track(\/|$)/, /^events?(\/|$)/, /^log(\/|$)/, /^client-log/, /^vitals/,
  /^radio\//, /^chat\//, /^sage\//, /^ai\/chat/, /(^|\/)typing(\/|$)/,
  /^dashboard-layout/, /(^|\/)drafts?(\/|$)/, /(^|\/)autosave(\/|$)/,
  /^notifications\/(read|seen|mark)/, /(^|\/)(mark-read|mark-seen|read-all)(\/|$)/,
  /^push\//, /^device/, /(^|\/)push-(subscribe|token|test)$/, /(^|\/)read-receipt$/,
  // The steps inside one upload — the upload queue reports the whole upload as one step.
  /(^|\/)upload-url$/, /(^|\/)signed-url$/, /^photos\/ingest$/, /^files\/record$/, /(^|\/)media\/ingest$/,
  /^portal\/sub\/media(\/done)?$/, /^ai\/escalation-check$/, /^design\/sessions$/,
];

/** Action word → [verb while running, verb once done, plain verb, noun phrase ({n} = the resource)]. */
type Act = [string, string, string, string?];
const ACTIONS: Record<string, Act> = {
  create: ['Saving', 'saved', 'save'], new: ['Saving', 'saved', 'save'], add: ['Adding', 'added', 'add'],
  save: ['Saving', 'saved', 'save'], update: ['Saving', 'saved', 'save'], edit: ['Saving', 'saved', 'save'], upsert: ['Saving', 'saved', 'save'],
  bulk: ['Saving', 'saved', 'save', '{n}s'], batch: ['Saving', 'saved', 'save', '{n}s'],
  delete: ['Deleting', 'deleted', 'delete'], remove: ['Removing', 'removed', 'remove'], archive: ['Archiving', 'archived', 'archive'],
  restore: ['Restoring', 'restored', 'restore'], unarchive: ['Restoring', 'restored', 'restore'], reopen: ['Reopening', 'reopened', 'reopen'],
  send: ['Sending', 'sent', 'send'], email: ['Emailing', 'emailed', 'email'], share: ['Sharing', 'shared', 'share'],
  invite: ['Sending', 'sent', 'send', 'invite'], resend: ['Resending', 'resent', 'resend', 'invite'],
  notify: ['Sending', 'sent', 'send', 'notification'], remind: ['Sending', 'sent', 'send', 'reminder'],
  request: ['Sending', 'sent', 'send', '{n} request'], submit: ['Submitting', 'submitted', 'submit'],
  approve: ['Approving', 'approved', 'approve'], reject: ['Rejecting', 'rejected', 'reject'], decline: ['Declining', 'declined', 'decline'],
  void: ['Voiding', 'voided', 'void'], sign: ['Signing', 'signed', 'sign'], countersign: ['Signing', 'signed', 'sign'],
  esign: ['Sending', 'sent', 'send', '{n} for signature'], generate: ['Generating', 'generated', 'generate'],
  pdf: ['Building', 'ready', 'build', '{n} PDF'], export: ['Exporting', 'exported', 'export'], report: ['Building', 'ready', 'build', '{n} report'],
  print: ['Preparing', 'ready', 'prepare', '{n} to print'], download: ['Preparing', 'ready', 'prepare', '{n} download'],
  upload: ['Uploading', 'uploaded', 'upload'], import: ['Importing', 'imported', 'import'], sync: ['Syncing', 'synced', 'sync'],
  close: ['Closing', 'closed', 'close'], complete: ['Completing', 'completed', 'complete'], finalize: ['Finalizing', 'finalized', 'finalize'],
  assign: ['Assigning', 'assigned', 'assign'], unassign: ['Unassigning', 'unassigned', 'unassign'], convert: ['Converting', 'converted', 'convert'],
  duplicate: ['Copying', 'copied', 'copy'], copy: ['Copying', 'copied', 'copy'], clone: ['Copying', 'copied', 'copy'],
  move: ['Moving', 'moved', 'move'], rename: ['Renaming', 'renamed', 'rename'], link: ['Linking', 'linked', 'link'], unlink: ['Unlinking', 'unlinked', 'unlink'],
  crop: ['Editing', 'edited', 'edit'], rotate: ['Rotating', 'rotated', 'rotate'], reorder: ['Reordering', 'reordered', 'reorder'],
  award: ['Awarding', 'awarded', 'award'], cancel: ['Cancelling', 'cancelled', 'cancel'],
  checkin: ['Checking in', 'checked in', 'check in'], checkout: ['Checking out', 'checked out', 'check out'],
  lock: ['Locking', 'locked', 'lock'], unlock: ['Unlocking', 'unlocked', 'unlock'],
  run: ['Running', 'finished', 'run'], scan: ['Scanning', 'scanned', 'scan'], analyze: ['Analyzing', 'analyzed', 'analyze'],
  estimate: ['Estimating', 'estimated', 'estimate'], extract: ['Reading', 'read', 'read'], parse: ['Reading', 'read', 'read'],
  ocr: ['Reading', 'read', 'read'], classify: ['Sorting', 'sorted', 'sort'], categorize: ['Sorting', 'sorted', 'sort'],
  suggest: ['Getting', 'ready', 'get', 'suggestions for {n}'], summarize: ['Summarizing', 'summarized', 'summarize'],
  build: ['Building', 'built', 'build'], 'auto-build': ['Building', 'built', 'build'], autopopulate: ['Filling in', 'filled in', 'fill in'],
  kickoff: ['Setting up', 'set up', 'set up'], seed: ['Setting up', 'set up', 'set up'],
  connect: ['Connecting', 'connected', 'connect'], disconnect: ['Disconnecting', 'disconnected', 'disconnect'], refresh: ['Refreshing', 'refreshed', 'refresh'],
  pay: ['Processing', 'processed', 'process', 'payment'], charge: ['Processing', 'processed', 'process', 'payment'], refund: ['Refunding', 'refunded', 'refund'],
  'clock-in': ['Clocking in', 'clocked in', 'clock in', ''], 'clock-out': ['Clocking out', 'clocked out', 'clock out', ''],
  login: ['Signing in', 'signed in', 'sign in', ''], logout: ['Signing out', 'signed out', 'sign out', ''], accept: ['Accepting', 'accepted', 'accept'],
  merge: ['Merging', 'merged', 'merge'], split: ['Splitting', 'split', 'split'], test: ['Testing', 'tested', 'test'],
  verify: ['Checking', 'checked', 'check'], validate: ['Checking', 'checked', 'check'], preview: ['Preparing', 'ready', 'prepare', '{n} preview'],
  rate: ['Saving', 'saved', 'save', 'rating'], comment: ['Adding', 'added', 'add', 'comment'], comments: ['Adding', 'added', 'add', 'comment'],
  reply: ['Sending', 'sent', 'send', 'reply'], respond: ['Sending', 'sent', 'send', 'response'], answer: ['Answering', 'answered', 'answer'],
  reset: ['Sending', 'sent', 'send', '{n} reset'], compare: ['Comparing', 'compared', 'compare'], push: ['Sending', 'sent', 'send', 'notification'],
  flag: ['Flagging', 'flagged', 'flag'], pin: ['Pinning', 'pinned', 'pin'], mark: ['Updating', 'updated', 'update'],
  calc: ['Calculating', 'calculated', 'calculate'], calculate: ['Calculating', 'done', 'calculate', ''], count: ['Counting', 'counted', 'count'],
  check: ['Checking', 'checked', 'check'], 'check-in': ['Checking in', 'checked in', 'check in'], 'check-out': ['Checking out', 'checked out', 'check out'],
};

/** Resource segment → the noun a GC uses (singular). */
const NOUNS: Record<string, string> = {
  'daily-logs': 'daily log', 'daily-log': 'daily log', 'punch-list': 'punch item', punch: 'punch item', rfis: 'RFI', rfi: 'RFI',
  'change-orders': 'change order', 'change-order': 'change order', 'pay-apps': 'pay application', payapp: 'pay application', 'pay-app': 'pay application',
  photos: 'photo', photo: 'photo', files: 'file', file: 'file', documents: 'document', document: 'document', versions: 'document',
  invoices: 'invoice', invoice: 'invoice', invoicing: 'invoice', inspections: 'inspection', inspection: 'inspection',
  submittals: 'submittal', submittal: 'submittal', schedule: 'schedule task', tasks: 'task', task: 'task', todos: 'to-do', todo: 'to-do',
  'bid-packages': 'bid package', 'bid-package': 'bid package', bids: 'bid', bid: 'bid', 'smart-packages': 'bid package',
  'purchase-orders': 'purchase order', 'purchase-order': 'purchase order', bills: 'bill', bill: 'bill',
  'lien-waivers': 'lien waiver', 'lien-waiver': 'lien waiver', contracts: 'contract', contract: 'contract',
  customers: 'customer', profiles: 'customer', leads: 'deal', lead: 'deal',
  team: 'team member', members: 'team member', roles: 'role', role: 'role', invites: 'invite', 'user-roles': 'role assignment',
  timeclock: 'time entry', clock: 'time entry', time: 'time entry', timesheets: 'timesheet', 'time-entries': 'time entry',
  'warranty-claims': 'warranty claim', warranty: 'warranty claim', 'service-tickets': 'service call', service: 'service call',
  drawings: 'drawing', drawing: 'drawing', sheets: 'drawing sheet', specs: 'spec', safety: 'safety record', jha: 'JHA', incidents: 'incident',
  takeoff: 'takeoff', takeoffs: 'takeoff', 'takeoff-projects': 'takeoff', 'takeoff-quantities': 'takeoff quantity',
  'takeoff-assemblies': 'assembly', assemblies: 'assembly', proposals: 'proposal', proposal: 'proposal',
  approvals: 'approval', notifications: 'notification', subs: 'subcontractor', subcontractors: 'subcontractor', sub: 'subcontractor',
  permits: 'permit', selections: 'selection', reviews: 'review', forms: 'form', 'cost-codes': 'cost code',
  directory: 'contact', contacts: 'contact', w9: 'W-9', compliance: 'compliance document', coi: 'insurance certificate',
  insurance: 'insurance certificate', closeout: 'closeout', checklist: 'checklist', budget: 'budget', 'budget-lines': 'budget line',
  'cost-control': 'cost report', reports: 'report', fleet: 'fleet asset', equipment: 'equipment',
  projects: 'job', project: 'job', jobs: 'job', meetings: 'meeting', 'meeting-minutes': 'meeting minutes', messages: 'message',
  prequalification: 'prequalification', templates: 'template', catalog: 'catalog item', materials: 'material', vendors: 'vendor',
  'resource-planning': 'crew assignment', assignments: 'assignment', crews: 'crew', payroll: 'payroll', 'certified-payroll': 'certified payroll',
  estimates: 'estimate', estimate: 'estimate', portals: 'portal invite', portal: 'portal', 'client-portal': 'client portal', 'sub-portal': 'sub portal',
  storage: 'storage', connectors: 'storage connection', integrations: 'integration', quickbooks: 'QuickBooks',
  settings: 'settings', branding: 'branding', billing: 'billing', subscription: 'subscription', 'trade-knowledge': 'knowledge article',
  heatmap: 'heat map', laser: 'laser scan', design: 'design', discovery: 'discovery', recommendations: 'recommendation',
  media: 'media', 'sub-media': 'sub upload', album: 'album', albums: 'album', folders: 'folder', folder: 'folder',
  autopilot: 'autopilot scan', intelligence: 'insight', network: 'network record', cables: 'cable', franchise: 'franchise record',
  'field-issues': 'field issue', observations: 'observation', 'tm-tickets': 'T&M ticket', 'daily-reports': 'daily report',
  dashboard: 'dashboard', home: 'home view', people: 'person', access: 'access', close: 'job closeout',
  jacket: 'bid jacket', addon: 'add-on', 'addon-request': 'add-on request', 'saved-views': 'view', 'user-preferences': 'setting',
};

const SENT_NOUNS = new Set(['messages', 'message', 'replies', 'reply', 'correspondence']);

const ID_SEG = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{24,}|\[.+\])$/i;
const GENERIC = new Set(['api', 'v1', 'v2', 'list', 'item', 'items', 'all', 'me', 'my']);

function nounFor(seg: string): string {
  if (NOUNS[seg]) return NOUNS[seg];
  const words = seg.replace(/[-_]+/g, ' ').trim();
  if (/ies$/.test(words)) return words.replace(/ies$/, 'y');
  if (/(ss|us|is)$/.test(words)) return words;
  return words.replace(/s$/, '');
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The words for one write, or null when it is background traffic or a read.
 * `pathname` may include /api/ and a query string.
 */
export function describeRequest(method: string, pathname: string): StatusWords | null {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null;
  const path = pathname.split('?')[0].replace(/^\/+/, '').replace(/^api\//, '').replace(/\/+$/, '');
  if (SILENT.some((re) => re.test(path))) return null;

  let segs = path.split('/').filter((s) => s && !ID_SEG.test(s) && !GENERIC.has(s.toLowerCase()));
  if (!segs.length) return null;

  // A compound last segment carries its own verb: generate-jacket, reset-password,
  // bulk-invite, to-bid-package. Split it into action + resource words.
  const last = segs[segs.length - 1];
  if (m === 'DELETE' && last.includes('-') && !NOUNS[last] && !ACTIONS[last]) return words(['Removing', 'removed', 'remove'], last.replace(/-/g, ' '));
  if (last.includes('-') && !NOUNS[last] && !ACTIONS[last]) {
    const w = last.split('-');
    if (w[0] === 'to' && w.length > 1) {
      return words(['Creating', 'created', 'create'], w.slice(1).join(' '));
    }
    if (ACTIONS[w[w.length - 1]] && w.length > 1) {
      const act = ACTIONS[w[w.length - 1]];
      // bulk-invite / batch-send act on several at once.
      if (w[0] === 'bulk' || w[0] === 'batch') return words(act, `${act[3] || nounFor(segs[segs.length - 2] || '')}s`);
      return words(act, act[3] !== undefined ? act[3].replace('{n}', w.slice(0, -1).join(' ')) : w.slice(0, -1).join(' '));
    }
    if (ACTIONS[w[0]] && w.length > 1) {
      const act = ACTIONS[w[0]];
      const rest = w.slice(1).join(' ');
      return words(act, act[3] !== undefined ? act[3].replace('{n}', rest) : nounFor(w.slice(1).join('-')));
    }
  }
  // AIA forms (G702, A310…) are generated documents.
  if (/^[abg]\d{3}[a-z]?$/i.test(last)) return words(['Generating', 'ready', 'generate'], `${last.toUpperCase()} form`);

  // The last action word decides the verb; the nearest resource word before it, the noun.
  let ai = -1;
  for (let i = segs.length - 1; i >= 1; i--) if (ACTIONS[segs[i].toLowerCase()]) { ai = i; break; }
  let ni = ai >= 0 ? ai - 1 : segs.length - 1;
  while (ni > 0 && ACTIONS[segs[ni].toLowerCase()] && !NOUNS[segs[ni]]) ni--;
  const noun = nounFor(segs[Math.max(0, ni)]);

  let act: Act;
  if (ai >= 0) act = ACTIONS[segs[ai].toLowerCase()];
  else if (m === 'DELETE') act = ACTIONS.delete;
  // Posting to a conversation sends a message rather than saving one.
  else if (m === 'POST' && SENT_NOUNS.has(segs[segs.length - 1])) act = ACTIONS.send;
  else act = ACTIONS.save;
  // DELETE on a route named for another action (…/batch, …/link, …/assign) takes that thing away.
  if (m === 'DELETE' && act[2] === 'save') act = ['Deleting', 'deleted', 'delete', act[3]];
  else if (m === 'DELETE' && !/^(delete|remove|archive|void|cancel|unlink|unassign|disconnect)$/.test(act[2])) act = ['Removing', 'removed', 'remove', act[3]];

  const tpl = act[3];
  return words(act, tpl === undefined ? noun : tpl.replace('{n}', noun).trim());
}

function words(act: Act, phrase: string): StatusWords {
  const [doing, past, base] = act;
  if (!phrase) return { doing, done: cap(past), failed: `Couldn't ${base}` };
  return { doing: `${doing} ${phrase}`, done: cap(`${phrase} ${past}`), failed: `Couldn't ${base} ${phrase}` };
}
