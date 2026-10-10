/**
 * A job's subcontractors: one line per company, amounts summed, paid from Paid invoices only;
 * form amounts parsed; an Add never blanks a company field.
 * Run: npx -y tsx lib/job-subs.sanity.test.ts   (exit 0 = every assertion held)
 */
import { groupJobSubs, parseAmount, companyUpdates, cleanText, type JobLinkRow } from './job-subs';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const co = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, company_name: name, ...extra });
const link = (id: string, sub: Record<string, unknown>, amount: number | string | null, pkg: string | null = null): JobLinkRow =>
  ({ id, subcontractor_id: String(sub.id), contract_amount: amount, status: 'assigned', bid_package_id: pkg, created_at: '2026-10-01', subcontractors: sub });

const elec = co('s1', 'Electric Co', { email: 'office@e.test', phone: '602-555-0100', w9_on_file: true });
const steel = co('s2', 'Acme Steel');
const rows = groupJobSubs(
  [link('l1', elec, '1000.50'), link('l2', steel, 50000, 'bp1'), link('l3', steel, 2500, 'bp2'), { ...link('l4', elec, 1), subcontractors: null }],
  [{ sub_id: 's1', amount: 500, net_amount: 450 }, { sub_id: 's1', amount: 100, net_amount: null }, { sub_id: null, amount: 9, net_amount: 9 }],
);
check('one line per company, sorted by name', rows.map((r) => r.company_name).join('|') === 'Acme Steel|Electric Co');
check('two awards on one job are summed and flagged', rows[0].contract_amount === 52500 && rows[0].assignment_ids.length === 2 && rows[0].from_award === true);
check('a numeric string amount counts', rows[1].contract_amount === 1000.5);
check('paid uses the net amount, falls back to the gross', rows[1].paid_amount === 550);
check('contact falls back to the older email/phone columns', rows[1].contact_email === 'office@e.test' && rows[1].contact_phone === '602-555-0100');
check('a row whose company is gone is skipped, not a crash', rows[1].assignment_ids.join() === 'l1');

check('blank amount → null', parseAmount('') === null && parseAmount(undefined) === null && parseAmount(null) === null);
check('"$12,500.00" → 12500', parseAmount('$12,500.00') === 12500);
check('negative, letters, 3 decimals → invalid', parseAmount('-1') === 'invalid' && parseAmount('12a') === 'invalid' && parseAmount('1.234') === 'invalid' && parseAmount(-3) === 'invalid');
check('cleanText trims and blanks to null', cleanText('  a ') === 'a' && cleanText('   ') === null && cleanText(0) === '0');

const cur = { company_name: 'Electric Co', trade: 'Electrical', contact_email: 'a@e.test', email: 'a@e.test', contact_phone: null, phone: '602-555-0199' };
const add = companyUpdates({ name: 'Electric Co', trade: '', contact_email: 'b@e.test', contact_phone: '602-555-0100' }, cur);
check('an Add sends only what changed and never blanks a field', JSON.stringify(Object.keys(add).sort()) === JSON.stringify(['contact_email', 'contact_phone', 'email']), JSON.stringify(add));
check('the old email follows the contact when it was the same address', add.email === 'b@e.test');
check('the old phone is kept when it was a different number', !('phone' in add));
const ed = companyUpdates({ company_name: '', trade: '', contact_name: 'Ed' }, cur, true);
check('an Edit can clear a field, but never the name', ed.trade === null && ed.contact_name === 'Ed' && !('company_name' in ed), JSON.stringify(ed));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
