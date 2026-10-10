/**
 * The status box's words and its step order.
 * Run: npx -y tsx lib/ui/status.sanity.test.ts   (exit 0 = every assertion held)
 */
import { describeRequest } from './status-labels';
import { step, getStatusGroups, dismissGroup, __resetStatus } from './status';
import { wordsFor, reasonForStatus, reasonFromResponse, isNetworkError } from './status-fetch';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const d = (m: string, p: string) => describeRequest(m, p);
const eq = (name: string, m: string, p: string, doing: string | null, done?: string, failedWords?: string) => {
  const w = d(m, p);
  if (doing === null) { check(name, w === null, JSON.stringify(w)); return; }
  check(name, !!w && w.doing === doing && (done === undefined || w.done === done) && (failedWords === undefined || w.failed === failedWords), JSON.stringify(w));
};

// ── words ────────────────────────────────────────────────────────────────────
eq('create daily log', 'POST', '/api/daily-logs/create', 'Saving daily log', 'Daily log saved', "Couldn't save daily log");
eq('punch item edit (id skipped)', 'PUT', '/api/punch-list/0b6c7a52-6f7a-4c39-9a51-1c2d3e4f5a6b', 'Saving punch item', 'Punch item saved');
eq('delete by method', 'DELETE', '/api/punch-list/0b6c7a52-6f7a-4c39-9a51-1c2d3e4f5a6b', 'Deleting punch item', 'Punch item deleted');
eq('batch delete says delete', 'DELETE', '/api/projects/abc123abc123abc123abc123abc1/punch-list/batch', 'Deleting punch items');
eq('approve change order', 'POST', '/api/change-orders/42/approve', 'Approving change order', 'Change order approved');
eq('send invite', 'POST', '/api/team/invite', 'Sending invite', 'Invite sent');
eq('compound verb: generate-jacket', 'POST', '/api/bid-packages/7/generate-jacket', 'Generating bid jacket');
eq('compound verb: reset-password', 'POST', '/api/team/users/7/reset-password', 'Sending password reset', 'Password reset sent');
eq('compound verb: bulk-invite', 'POST', '/api/sub-portal/bulk-invite', 'Sending invites');
eq('compound verb: to-bid-package', 'POST', '/api/heatmap/to-bid-package', 'Creating bid package');
eq('AIA form', 'POST', '/api/documents/g702', 'Generating G702 form', 'G702 form ready');
eq('posting a message sends it', 'POST', '/api/portal/client/messages', 'Sending message', 'Message sent');
eq('editing a message saves it', 'PATCH', '/api/portal/client/messages', 'Saving message');
eq('query string ignored', 'POST', '/api/rfis/create?x=1', 'Saving RFI');
eq('Supabase table write', 'POST', 'punch_items', 'Saving punch item');

// ── quiet: reads and background traffic ─────────────────────────────────────
eq('GET is quiet', 'GET', '/api/daily-logs/create', null);
eq('auth is quiet', 'POST', '/api/auth/refresh', null);
eq('presence is quiet', 'POST', '/api/presence/heartbeat', null);
eq('upload internals are quiet (the queue reports the upload)', 'POST', '/api/photos/upload-url', null);
eq('photo ingest is quiet', 'POST', '/api/photos/ingest', null);
eq('sub media record is quiet', 'POST', '/api/portal/sub/media', null);
eq('push registration is quiet', 'POST', '/api/notifications/push-token', null);
eq('read receipts are quiet', 'POST', '/api/projects/1/correspondence/2/read-receipt', null);
eq('chat stream is quiet', 'POST', '/api/sage/chat', null);

// ── which requests the fetch watcher describes ──────────────────────────────
const O = 'https://www.saguarocontrol.net', SB = 'https://abc.supabase.co';
check('own /api write described', wordsFor('POST', '/api/rfis/create', O, SB)?.doing === 'Saving RFI');
check('absolute own-origin url described', wordsFor('POST', `${O}/api/rfis/create`, O, SB)?.doing === 'Saving RFI');
check('other origin ignored', wordsFor('POST', 'https://api.stripe.com/v1/x', O, SB) === null);
check('Supabase table write described', wordsFor('PATCH', `${SB}/rest/v1/punch_items?id=eq.1`, O, SB)?.doing === 'Saving punch item');
check('Supabase rpc ignored (often a read)', wordsFor('POST', `${SB}/rest/v1/rpc/thing`, O, SB) === null);
check('Supabase auth ignored', wordsFor('POST', `${SB}/auth/v1/token`, O, SB) === null);
check('non-api page ignored', wordsFor('POST', '/app/projects', O, SB) === null);

// ── reasons ──────────────────────────────────────────────────────────────────
check('401 → signed out', /signed out/.test(reasonForStatus(401)));
check('403 → role', /role/.test(reasonForStatus(403)));
check('500 → server problem', /server had a problem/.test(reasonForStatus(503)));
check('network error recognised', isNetworkError(new TypeError('Failed to fetch')) && isNetworkError(new TypeError('Load failed')));
check('ordinary error is not a network error', !isNetworkError(new Error('bad input')));

// ── the store: numbered, in order, one box at a time ────────────────────────
async function store() {
  __resetStatus();
  const a = step('Saving punch item');
  const b = step('Uploading 3 photos');
  const c = step('Send to Ruiz & Sons', { state: 'waiting', detail: 'waiting for step 2' });
  let g = getStatusGroups();
  check('three steps share one box, in start order', g.length === 1 && g[0].steps.map((s) => s.label).join('|') === 'Saving punch item|Uploading 3 photos|Send to Ruiz & Sons');
  a.done('Punch item saved');
  b.update({ count: { done: 2, total: 3 }, progress: 0.66 });
  g = getStatusGroups();
  check('finished step keeps its place', g[0].steps[0].state === 'done' && g[0].steps[0].result === 'Punch item saved');
  check('progress shown', g[0].steps[1].count?.done === 2 && g[0].steps[1].progress === 0.66);
  check('box not settled while steps run', g[0].settledAt === null);
  b.done('3 photos uploaded');
  c.update({ state: 'running', detail: undefined });
  c.done('Sent to Ruiz & Sons');
  g = getStatusGroups();
  check('all done → settled', g[0].settledAt !== null && g[0].steps.every((s) => s.state === 'done'));

  // A failure stays; the reason is kept.
  __resetStatus();
  const f = step('Saving RFI');
  f.fail("Couldn't save RFI", 'Subject is required');
  g = getStatusGroups();
  check('failure kept with reason', g[0].steps[0].state === 'failed' && g[0].steps[0].detail === 'Subject is required');
  await new Promise((r) => setTimeout(r, 3300));
  check('failure still there after the done-linger', getStatusGroups().length === 1);
  dismissGroup(getStatusGroups()[0].id);
  check('dismiss closes it', getStatusGroups().length === 0);

  // Done boxes close by themselves.
  __resetStatus();
  step('Saving daily log').done('Daily log saved');
  check('done box visible at first', getStatusGroups().length === 1);
  await new Promise((r) => setTimeout(r, 3300));
  check('done box closes by itself after ~3 s', getStatusGroups().length === 0);

  // A navigation step leaves no trace.
  __resetStatus();
  const n = step('Opening Jobs', { transient: true });
  n.drop();
  check('dropped navigation step is gone', getStatusGroups().length === 0);

  // Offline result + no-signal flag.
  __resetStatus();
  step('Saving punch item').offline('Punch item — saved on this phone', "It sends by itself when you're back online.");
  const s2 = step('Uploading photo');
  s2.fail("Couldn't upload photo", 'No signal', true);
  g = getStatusGroups();
  check('offline step recorded', g[0].steps[0].state === 'offline');
  check('net failure flagged', g[0].steps[1].net === true);

  // A new action after a finished box starts a fresh box.
  __resetStatus();
  step('A').done('A done');
  await new Promise((r) => setTimeout(r, 1300));
  step('B');
  g = getStatusGroups();
  check('new action → fresh box numbered from 1', g.length === 1 && g[0].steps.length === 1 && g[0].steps[0].label === 'B');
  __resetStatus();
}

async function reasons() {
  const r1 = await reasonFromResponse(new Response(JSON.stringify({ error: 'Subject is required' }), { status: 400 }));
  check("server's own words used", r1 === 'Subject is required', r1);
  const r2 = await reasonFromResponse(new Response('<html>bad gateway</html>', { status: 502 }));
  check('HTML error page → plain words', /server had a problem/.test(r2), r2);
  const r3 = await reasonFromResponse(new Response(JSON.stringify({ error: 'HTTP 500' }), { status: 500 }));
  check('bare "HTTP 500" replaced by plain words', /server had a problem/.test(r3), r3);
}

(async () => {
  await store();
  await reasons();
  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})();
