/**
 * Website lead intake and schedule baselines — the rules behind #5.
 * Run: npx -y tsx lib/lead-intake.sanity.test.ts   (exit 0 = every assertion held)
 */
import { budgetValue, embedFormHtml, leadNotes, parseLeadSubmission } from './lead-intake';
import { baselineSummary, finishVariance, varianceLabel } from './schedule-baseline';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const NOW = 1_800_000_000_000;

// ── A real request ──
const good = parseLeadSubmission({ name: ' Jane Smith ', email: 'Jane@Example.com', phone: '', project_type: 'Kitchen remodel', budget: '$25k–$100k', timeline: '1–3 months', message: 'New cabinets and counters.', started_at: String(NOW - 60_000) }, NOW);
check('accepted', good.ok === true);
if (good.ok) {
  check('name trimmed', good.lead.contact_name === 'Jane Smith');
  check('email lower-cased', good.lead.email === 'jane@example.com');
  check('known project type kept', good.lead.project_type === 'Kitchen remodel');
  check('notes carry budget, timeline and message', /Budget: \$25k–\$100k/.test(leadNotes(good.lead)) && /New cabinets/.test(leadNotes(good.lead)));
}
check('budget low end for the pipeline', budgetValue('$100k–$250k') === 100000 && budgetValue('Not sure yet') === 0 && budgetValue(null) === 0);

// ── People get told what to fix ──
const noName = parseLeadSubmission({ email: 'a@b.co' }, NOW);
check('name required', !noName.ok && !noName.spam && /name/.test(noName.error));
const noContact = parseLeadSubmission({ name: 'Bo' }, NOW);
check('email or phone required', !noContact.ok && !noContact.spam && /email or a phone/.test(noContact.error));
const badEmail = parseLeadSubmission({ name: 'Bo', email: 'bo@nowhere' }, NOW);
check('bad email refused', !badEmail.ok && !badEmail.spam);
check('phone alone is enough', parseLeadSubmission({ name: 'Bo', phone: '(602) 555-0100' }, NOW).ok);
const odd = parseLeadSubmission({ name: 'Bo', phone: '6025550100', project_type: 'Moon base', budget: '$9 trillion' }, NOW);
check('unknown choices dropped, not saved', odd.ok && odd.lead.project_type === null && odd.lead.budget === null);

// ── Bots are dropped silently ──
const honey = parseLeadSubmission({ name: 'Bot', email: 'b@b.co', website: 'http://spam' }, NOW);
check('honeypot → spam', !honey.ok && honey.spam);
const fast = parseLeadSubmission({ name: 'Bot', email: 'b@b.co', started_at: String(NOW - 500) }, NOW);
check('filled in half a second → spam', !fast.ok && fast.spam);
const links = parseLeadSubmission({ name: 'Bot', email: 'b@b.co', message: 'http://a.x http://b.x http://c.x http://d.x' }, NOW);
check('link-stuffed message → spam', !links.ok && links.spam);
check('no start stamp (pasted form) is not spam by itself', parseLeadSubmission({ name: 'Ann', email: 'a@b.co' }, NOW).ok);

// ── Paste-in form ──
const html = embedFormHtml('https://x.test/api/portal/lead/abc', 'Acme "Builders" <LLC>');
check('form posts to the key URL', html.includes('action="https://x.test/api/portal/lead/abc"') && html.includes('method="POST"'));
check('company name cannot break out of the markup', !html.includes('<LLC>') && !html.includes('"Builders"'));
check('honeypot present in the paste-in form', html.includes('name="website"'));

// ── Schedule baseline ──
check('late by 3 days', finishVariance({ end_date: '2026-11-04', baseline_end: '2026-11-01' }) === 3);
check('early by 2 days', finishVariance({ end_date: '2026-10-30', baseline_end: '2026-11-01' }) === -2);
check('no baseline → null', finishVariance({ end_date: '2026-11-04' }) === null);
check('across a DST change, still whole days', finishVariance({ end_date: '2026-11-03', baseline_end: '2026-10-31' }) === 3);
const s = baselineSummary([
  { end_date: '2026-11-04', baseline_end: '2026-11-01' },
  { end_date: '2026-11-10', baseline_end: '2026-11-10' },
  { end_date: '2026-11-20', baseline_end: '2026-11-15' },
  { end_date: '2026-11-02' }, // added after the baseline
]);
check('two of three baselined tasks late', s.baselined === 3 && s.late === 2, JSON.stringify(s));
check('finish moved 5 days', s.finishVariance === 5, JSON.stringify(s));
check('labels', varianceLabel(3) === '+3d' && varianceLabel(-2) === '−2d' && varianceLabel(0) === 'on plan' && varianceLabel(null) === '');

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall ok');
