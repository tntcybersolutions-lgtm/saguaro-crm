/**
 * "Ask for it": the compliance checklist per sub and the message the sub reads.
 * Run: npx -y tsx lib/compliance-ask.sanity.test.ts   (exit 0 = every assertion held)
 */
import { subChecklist, askMessage, cooldown, isRequiredDoc, ASK_COOLDOWN_MS } from './compliance-ask';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const T = '2026-10-10';
const st = (rows: any[]) => Object.fromEntries(subChecklist(rows, T).map((c) => [c.doc, c.state]));

check('nothing uploaded → both missing', JSON.stringify(st([])) === '{"insurance":"missing","w9":"missing"}');
check('a row with no file is still missing', st([{ doc_type: 'insurance', file_url: null, expiry_date: '2027-01-01' }]).insurance === 'missing');
check('a rejected upload is still missing', st([{ doc_type: 'w9', file_url: 'x', status: 'rejected' }]).w9 === 'missing');
check('COI far out → current', st([{ doc_type: 'insurance', file_url: 'x', expiry_date: '2027-06-01' }]).insurance === 'current');
check('COI in 15 days → expiring', st([{ doc_type: 'insurance', file_url: 'x', expiry_date: '2026-10-25' }]).insurance === 'expiring');
check('COI expiring today is still valid (expiring, not expired)', st([{ doc_type: 'insurance', file_url: 'x', expiry_date: '2026-10-10' }]).insurance === 'expiring');
check('COI yesterday → expired', st([{ doc_type: 'insurance', file_url: 'x', expiry_date: '2026-10-09' }]).insurance === 'expired');
check('W-9 with no expiry → current', st([{ doc_type: 'w9', file_url: 'x' }]).w9 === 'current');
check('newest upload wins over an older expired one', st([
  { doc_type: 'insurance', file_url: 'old', expiry_date: '2026-01-01', created_at: '2025-01-01' },
  { doc_type: 'insurance', file_url: 'new', expiry_date: '2027-06-01', created_at: '2026-09-01' },
]).insurance === 'current');
check('portal spellings: "coi" and "W-9"', st([{ doc_type: 'coi', file_url: 'x', expiry_date: '2027-01-01' }, { doc_type: 'W-9', file_url: 'x' }]).insurance === 'current' && st([{ doc_type: 'W-9', file_url: 'x' }]).w9 === 'current');

const msg = askMessage(subChecklist([{ doc_type: 'insurance', file_url: 'x', expiry_date: '2026-10-25' }], T), 'ZZ AUDIT Builders');
check('message names the GC', msg.startsWith('ZZ AUDIT Builders needs updated paperwork from you:'), msg);
check('message says the COI expiry date', /Insurance certificate \(COI\) — expires Oct 25, 2026\./.test(msg), msg);
check('message says the W-9 is missing', /W-9 — we don't have one on file\./.test(msg));
check('message says where to upload and why', /Compliance tab of this portal\. Invoices are held/.test(msg));
check('expires today reads "today"', /expires today/.test(askMessage(subChecklist([{ doc_type: 'insurance', file_url: 'x', expiry_date: T }], T).slice(0, 1))));
check('no GC name → "We need"', askMessage([], null).startsWith('We need'));

const now = Date.parse('2026-10-10T12:00:00Z');
const c1 = cooldown(['insurance', 'w9'], { insurance: new Date(now - 2 * 3600_000).toISOString() }, now);
check('asked 2 h ago → waits; the other goes', c1.ask.join() === 'w9' && c1.wait[0].doc === 'insurance');
const c2 = cooldown(['insurance'], { insurance: new Date(now - ASK_COOLDOWN_MS - 1000).toISOString() }, now);
check('asked over a day ago → can ask again', c2.ask.join() === 'insurance' && !c2.wait.length);
check('doc guard', isRequiredDoc('w9') && isRequiredDoc('insurance') && !isRequiredDoc('license') && !isRequiredDoc(null));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
