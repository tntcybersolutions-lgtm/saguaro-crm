/**
 * Lien waiver types: the screen's words → the database's.
 * Run: npx -y tsx lib/lien-waiver-type.sanity.test.ts   (exit 0 = every assertion held)
 */
import { waiverTypes, isCalendarDay, waiverAmount } from './lien-waiver-type';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const t = (x: unknown) => JSON.stringify(waiverTypes(x));

// The screen's "partial" is the database's "progress" — the CHECK only takes the latter.
check('conditional_partial → conditional_progress', waiverTypes('conditional_partial')?.db === 'conditional_progress', t('conditional_partial'));
check('unconditional_partial → unconditional_progress', waiverTypes('unconditional_partial')?.db === 'unconditional_progress');
check('database word accepted as is', waiverTypes('conditional_progress')?.db === 'conditional_progress');
check('final stays final', waiverTypes('unconditional_final')?.db === 'unconditional_final' && waiverTypes('unconditional_final')?.pdf === 'unconditional_final');
check('pdf engine gets its own word back', waiverTypes('conditional_progress')?.pdf === 'conditional_partial');
check('case and spaces forgiven', waiverTypes('  Conditional_Partial ')?.db === 'conditional_progress');
check('unknown type refused', waiverTypes('partial') === null && waiverTypes('') === null && waiverTypes(null) === null && waiverTypes(3) === null);
const DB_CHECK = ['conditional_progress', 'unconditional_progress', 'conditional_final', 'unconditional_final'];
check('every accepted input lands on a value the CHECK allows',
  ['conditional_partial', 'unconditional_partial', 'conditional_progress', 'unconditional_progress', 'conditional_final', 'unconditional_final']
    .every((x) => DB_CHECK.includes(waiverTypes(x)!.db)));

check('calendar day ok', isCalendarDay('2026-09-30'));
check('impossible day refused', !isCalendarDay('2026-02-30') && !isCalendarDay('2026-9-30') && !isCalendarDay('') && !isCalendarDay(undefined));

check('amount number', waiverAmount(11250) === 11250);
check('amount string', waiverAmount('11250.505') === 11250.51);
check('amount zero allowed (a blank waiver to fill)', waiverAmount(0) === 0);
check('negative refused', waiverAmount(-1) === null);
check('blank / junk refused', waiverAmount('') === null && waiverAmount('abc') === null && waiverAmount(null) === null && waiverAmount(Infinity) === null);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
