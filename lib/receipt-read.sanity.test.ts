/**
 * A model's reading of a receipt is cleaned before it prefills a bill.
 * Run: npx -y tsx lib/receipt-read.sanity.test.ts   (exit 0 = every assertion held)
 */
import { normalizeReceipt } from './receipt-read';
import { logLine, normalizeUpdate } from './owner-update';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const codes = ['06 10 00', '26 05 00'];

// ── Receipt money ──
const a = normalizeReceipt({ vendor_name: ' Home Depot #0451 ', subtotal: '$1,204.50', tax: 96.36, total: '1300.86', cost_code: '06 10 00', confidence: 'HIGH' }, codes);
check('vendor trimmed', a.vendor_name === 'Home Depot #0451');
check('money parsed from "$1,204.50"', a.subtotal === 1204.5, String(a.subtotal));
check('total kept', a.total === 1300.86);
check('a job cost code is kept', a.cost_code === '06 10 00' && a.division === '06');
check('confidence lower-cased', a.confidence === 'high');

const b = normalizeReceipt({ total: 54.1, tax: 4.1 }, codes);
check('subtotal derived from total − tax', b.subtotal === 50, String(b.subtotal));
const c = normalizeReceipt({ subtotal: 100, tax: 8.25 }, codes);
check('total derived from subtotal + tax', c.total === 108.25, String(c.total));
const d = normalizeReceipt({ subtotal: 100, total: 107.5 }, codes);
check('tax derived from total − subtotal', d.tax === 7.5, String(d.tax));

// ── Things never trusted ──
const e = normalizeReceipt({ cost_code: '09 99 99', division: 'Div 9', bill_date: '2026-02-30', due_date: 'net 30', vendor_email: 'not an email', total: -5, confidence: 'certain' }, codes);
check('a code not on this job is dropped', e.cost_code === null);
check('Feb 30 is not a date', e.bill_date === null);
check('"net 30" is not a date', e.due_date === null);
check('bad email dropped', e.vendor_email === null);
check('negative money dropped', e.total === null);
check('unknown confidence → low', e.confidence === 'low');
check('garbage in → nulls, no throw', normalizeReceipt('nope', codes).vendor_name === null);

// ── Homeowner update ──
const line = logLine({ log_date: '2026-10-09', work_performed: 'Framed the garage walls', manpower_count: 6, weather: 'Clear', photos_count: 4, incidents: 'should never appear' });
check('log line carries work, crew, weather, photos', /Framed the garage walls/.test(line) && /crew on site: 6/.test(line) && /Clear/.test(line) && /4 photos/.test(line), line);
check('log line leaves incidents out', !/should never appear/.test(line));
check('update needs a body', normalizeUpdate({ title: 'x', body: 'short' }, 'fb') === null);
const u = normalizeUpdate({ body: 'The garage walls are framed and the roof trusses arrive Monday.' }, 'Progress update');
check('missing title falls back', u?.title === 'Progress update');

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall ok');
