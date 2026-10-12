/**
 * Switch-over import — columns, values and rows from other apps' exports.
 * Run: npx -y tsx lib/import/switch-over.sanity.test.ts   (exit 0 = every assertion held)
 */
import { parseCsv, autoMap, parseMoney, parseDate, jobStatus, rowToBody, dedupeKey } from './switch-over';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// CSV
const csv = '﻿Job Name,Contract Price,Notes\r\n"Smith, Kitchen","$45,000.00","line1\nline2 ""quoted"""\r\n\r\nBarn,1200,\r\n';
const rows = parseCsv(csv);
check('BOM stripped, blank line dropped', rows.length === 3 && rows[0][0] === 'Job Name', JSON.stringify(rows));
check('comma inside quotes', rows[1][0] === 'Smith, Kitchen');
check('newline + doubled quote inside quotes', rows[1][2] === 'line1\nline2 "quoted"', rows[1][2]);
check('trailing empty field kept', rows[2].length === 3 && rows[2][2] === '');

// Buildertrend-style job export headers
const bt = ['Job Name', 'Job Number', 'Street Address', 'City', 'State', 'Zip', 'Job Status', 'Contract Price', 'Projected Start', 'Customer', 'Customer Email'];
const m = autoMap(bt, 'jobs');
check('Buildertrend headers all matched', ['name', 'projectNumber', 'address', 'city', 'state', 'zip', 'status', 'contractValue', 'startDate', 'ownerName', 'ownerEmail'].every((k) => m[k] >= 0), JSON.stringify(m));
check('Customer → owner, not job name', m.ownerName === 9 && m.name === 0);
const body = rowToBody('jobs', ['Smith Remodel', 'BT-1042', '12 Main St', 'Mesa', 'AZ', '85201', 'Closed', '$128,500', '03/07/2026', 'Pat Smith', 'pat@example.com'], m)!;
check('job body', body.name === 'Smith Remodel' && body.projectNumber === 'BT-1042' && body.contractValue === 128500 && body.startDate === '2026-03-07' && body.status === 'completed' && body.ownerName === 'Pat Smith', JSON.stringify(body));
check('address joined', body.address === '12 Main St, Mesa, AZ 85201', String(body.address));
check('row with no job name is skipped', rowToBody('jobs', ['', 'X'], m) === null);
check('a sold job lands building, not bidding', body.phase === 'building', String(body.phase));
check('an estimating job lands bidding', rowToBody('jobs', ['Est Job', '', '', '', '', '', 'Estimating', '', '', '', ''], m)!.phase === 'bidding');
check('jurisdiction from the State column', body.stateJurisdiction === 'AZ', String(body.stateJurisdiction));
const tx = rowToBody('jobs', ['Hill Country Build', '', '9 Oak Ln', 'Austin', 'Texas', '78701', 'Open', '', '', '', ''], m)!;
check('a Texas job is never left on the Arizona default', tx.stateJurisdiction === 'TX', String(tx.stateJurisdiction));
const noState = rowToBody('jobs', ['Garage', '', '5 Elm St', '', '', '', '', '', '', '', ''], m)!;
check('no state anywhere → none sent (the create route decides)', !('stateJurisdiction' in noState), JSON.stringify(noState));

// JobTread-style lead export
const jt = ['Name', 'Email', 'Phone', 'Status', 'Source', 'Estimated Revenue'];
const lm = autoMap(jt, 'leads');
const lead = rowToBody('leads', ['Ann Lee', 'ann@ex.com', '602-555-0100', 'Proposal', 'Referral', '$75k'], lm)!;
check('lead body', lead.contact_name === 'Ann Lee' && lead.email === 'ann@ex.com' && lead.stage === 'Proposal' && lead.source === 'Referral', JSON.stringify(lead));

// values
check('money with symbols', parseMoney('$1,234.50') === 1234.5);
check('money in parens is negative', parseMoney('(250.00)') === -250);
check('blank money is null', parseMoney('') === null && parseMoney('n/a') === null);
check('dates: M/D/YYYY', parseDate('3/7/2026') === '2026-03-07');
check('dates: M/D/YY', parseDate('03/07/26') === '2026-03-07');
check('dates: ISO', parseDate('2026-03-07T00:00:00Z') === '2026-03-07');
check('dates: words', parseDate('Mar 7, 2026') === '2026-03-07', String(parseDate('Mar 7, 2026')));
check('dates: junk is null', parseDate('soon') === null);
check('status: open → active', jobStatus('Open') === 'active' && jobStatus('') === 'active');
check('status: closed / warranty → completed', jobStatus('Closed') === 'completed' && jobStatus('Warranty') === 'completed');

// customers + dedupe
const cm = autoMap(['Display Name', 'Email Address', 'Cell Phone'], 'customers');
const cust = rowToBody('customers', ['Bo Diaz', 'BO@EX.COM', '602-555-0100'], cm)!;
check('customer body', cust.name === 'Bo Diaz' && cust.email === 'BO@EX.COM' && cust.phone === '602-555-0100', JSON.stringify(cust));
check('dedupe by email, case-insensitive', dedupeKey('customers', cust) === 'bo@ex.com');
check('dedupe jobs by name', dedupeKey('jobs', { name: ' Smith Remodel ' }) === 'smith remodel');

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
