/**
 * The server's database fetch retries only a query that never started.
 * Run: npx -y tsx lib/db-retry-fetch.sanity.test.ts   (exit 0 = every assertion held)
 */
import { withDbRetry, isUnstartedQuery } from './db-retry-fetch';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const noWait = async () => {};
/** A fake database: answers each call with the next response in the list. */
function fake(answers: (() => Response)[]) {
  let calls = 0;
  const fn = async () => answers[Math.min(calls++, answers.length - 1)]();
  return { fn, calls: () => calls };
}

(async () => {
  const blip = () => json(503, { code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' });
  const ok = () => json(200, [{ id: 1 }]);

  let f = fake([blip, blip, ok]);
  let res = await withDbRetry(f.fn, noWait)('https://db/rest/v1/projects', { method: 'GET' });
  check('schema-cache blip is ridden out', res.status === 200 && f.calls() === 3, `status ${res.status}, calls ${f.calls()}`);

  f = fake([() => json(503, { code: 'PGRST003', message: 'Timed out acquiring connection' }), ok]);
  res = await withDbRetry(f.fn, noWait)('https://db/rest/v1/punch_list', { method: 'POST', body: '{"title":"x"}' });
  check('pool timeout on a write (string body) is retried', res.status === 200 && f.calls() === 2);

  f = fake([blip]);
  res = await withDbRetry(f.fn, noWait)('https://db/rest/v1/projects', { method: 'GET' });
  check('gives up after 3 retries and returns the 503', res.status === 503 && f.calls() === 4, `calls ${f.calls()}`);

  f = fake([() => json(500, { code: '23505', message: 'duplicate key' }), ok]);
  res = await withDbRetry(f.fn, noWait)('https://db/rest/v1/x', { method: 'POST', body: '{}' });
  check('a real database error is not retried', res.status === 500 && f.calls() === 1);

  f = fake([() => new Response('Service Unavailable', { status: 503 }), ok]);
  res = await withDbRetry(f.fn, noWait)('https://db/storage/v1/object', { method: 'GET' });
  check('a 503 that is not PostgREST\'s is not retried', res.status === 503 && f.calls() === 1);

  f = fake([blip, ok]);
  res = await withDbRetry(f.fn, noWait)('https://db/storage/v1/object/x', { method: 'POST', body: new ReadableStream() as unknown as BodyInit });
  check('a streamed body is never sent twice', res.status === 503 && f.calls() === 1);

  f = fake([ok]);
  res = await withDbRetry(f.fn, noWait)('https://db/rest/v1/projects');
  check('a good answer passes straight through', res.status === 200 && f.calls() === 1);
  const body = await res.json();
  check('the body is still readable after the check', Array.isArray(body) && body[0].id === 1);

  check('isUnstartedQuery reads PGRST001', await isUnstartedQuery(json(503, { code: 'PGRST001' })));
  check('isUnstartedQuery ignores a 503 without a code', !(await isUnstartedQuery(json(503, { message: 'x' }))));

  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log('\nall db-retry-fetch checks passed');
})();
