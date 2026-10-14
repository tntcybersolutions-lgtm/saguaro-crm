/**
 * background — finish work after the response has been sent.
 *
 * Routes kicked off their follow-up work (RFI, pay-app, change-order and
 * assignment triggers: the database reads, the in-app notification and the
 * email) with `trigger(id).catch(...)` and returned at once. On Vercel the
 * function is frozen as soon as the response goes out, so that work usually
 * never finished — which is why almost none of those emails ever left.
 *
 * waitUntil keeps the function alive until the work settles, without making
 * the user wait for it. Outside Vercel (local dev, tests) the work simply runs
 * to completion in the same process.
 */
import { waitUntil } from '@vercel/functions';

export function runInBackground(work: Promise<unknown> | (() => Promise<unknown>), label: string): void {
  const p = Promise.resolve()
    .then(() => (typeof work === 'function' ? work() : work))
    .catch((err) => { console.error(`[background] ${label} failed`, err); });
  try {
    waitUntil(p);
  } catch (err) {
    // No request context (a script or test): the promise still runs here.
    console.error(`[background] ${label}: waitUntil unavailable`, err);
  }
}
