/**
 * Optional-column writes.
 * Run: npx -y tsx lib/optional-column.sanity.test.ts   (exit 0 = every assertion held)
 */
import { isMissingColumn, writeWithOptionalColumns, type DbError } from './optional-column';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const pgrst = (col: string, table = 'team_invites'): DbError => ({
  code: 'PGRST204', message: `Could not find the '${col}' column of '${table}' in the schema cache`,
});
const undef = (col: string, table = 'team_invites'): DbError => ({
  code: '42703', message: `column ${table}.${col} does not exist`,
});

// isMissingColumn
check('PGRST204 names the column', isMissingColumn(pgrst('name'), 'name'));
check('42703 names the column', isMissingColumn(undef('name'), 'name'));
check('42703 bare "column x"', isMissingColumn({ code: '42703', message: 'column name does not exist' }, 'name'));
check('a different column is not a match', !isMissingColumn(pgrst('display_name'), 'name'));
check('a longer column is not a match', !isMissingColumn(undef('name_full'), 'name'));
check('other error codes never match', !isMissingColumn({ code: '23505', message: "duplicate key 'name'" }, 'name'));
check('null error → false', !isMissingColumn(null, 'name'));

// writeWithOptionalColumns
(async () => {
  // Column exists → one attempt, nothing dropped, name sent.
  const seen1: Record<string, unknown>[] = [];
  const r1 = await writeWithOptionalColumns({ email: 'a@b.co', name: 'Ann' }, ['name'], async (row) => { seen1.push(row); return { error: null }; });
  check('column present: single attempt', seen1.length === 1 && seen1[0].name === 'Ann' && r1.dropped.length === 0);

  // Column missing → retried once without it.
  const seen2: Record<string, unknown>[] = [];
  const r2 = await writeWithOptionalColumns({ email: 'a@b.co', name: 'Ann' }, ['name'], async (row) => {
    seen2.push(row);
    return { error: 'name' in row ? pgrst('name') : null };
  });
  check('column missing: retried without it', seen2.length === 2 && !('name' in seen2[1]) && seen2[1].email === 'a@b.co');
  check('column missing: reports the drop', r2.dropped.join() === 'name' && r2.result.error === null);

  // A real refusal is returned untouched — no retry.
  const seen3: Record<string, unknown>[] = [];
  const r3 = await writeWithOptionalColumns({ email: 'a@b.co', name: 'Ann' }, ['name'], async (row) => {
    seen3.push(row);
    return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
  });
  check('real error: no retry', seen3.length === 1 && r3.result.error?.code === '23505' && r3.dropped.length === 0);

  // A missing REQUIRED column is not silently dropped.
  const seen4: Record<string, unknown>[] = [];
  const r4 = await writeWithOptionalColumns({ email: 'a@b.co', bogus: 1 }, ['name'], async (row) => {
    seen4.push(row);
    return { error: pgrst('bogus') };
  });
  check('non-optional missing column: surfaced, not dropped', seen4.length === 1 && r4.result.error?.code === 'PGRST204');

  // Two optional columns both missing → both dropped, three attempts.
  const seen5: Record<string, unknown>[] = [];
  const r5 = await writeWithOptionalColumns({ body: 'x', edited_at: 't', name: 'n' }, ['edited_at', 'name'], async (row) => {
    seen5.push(row);
    if ('edited_at' in row) return { error: pgrst('edited_at', 'radio_messages') };
    if ('name' in row) return { error: undef('name', 'radio_messages') };
    return { error: null };
  });
  check('two optional columns missing: both dropped', seen5.length === 3 && r5.dropped.join() === 'edited_at,name' && r5.result.error === null);

  if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
  console.log('\nall optional-column assertions held');
})();
