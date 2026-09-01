import { NextResponse } from 'next/server';

/**
 * api-error — one way to fail an API route.
 *
 * Routes used to hand the raw exception straight back to the browser:
 *
 *   return NextResponse.json({ error: e.message }, { status: 500 });
 *
 * A Postgres error message carries the table it hit, the column, the
 * constraint name, sometimes the failing value. That is a schema map for
 * anyone who pokes the API, and this product is about to take card details.
 * CLAUDE.md's own status table asked for `e.message` on a 500 — that guidance
 * is what this replaces.
 *
 * The trade this makes: the client gets a message it can show a GC, the server
 * log gets the real error, and a correlation id ties the two together. Support
 * asks for the code on screen and finds the exact stack in the logs. Nothing is
 * lost except the leak.
 */

/** Short, readable, unambiguous — no 0/O or 1/I to misread over the phone. */
function correlationId(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Log the real error, return a safe one.
 *
 * @param scope  where it happened, e.g. 'projects/create' — prefixes the log
 * @param err    the caught exception, logged in full
 * @param client what to show the user. Write it for a GC, not an engineer.
 * @param status defaults to 500
 */
export function apiError(
  scope: string,
  err: unknown,
  client = 'Something went wrong on our end. Please try again.',
  status = 500
): NextResponse {
  const ref = correlationId();
  // Full detail, server-side only. Never reaches the response body.
  console.error(`[${scope}] ref=${ref}`, err);
  return NextResponse.json({ error: client, ref }, { status });
}

/**
 * For the 4xx cases where the message IS the point — a missing field, a
 * duplicate, a record that is not there. These are our words, not the
 * database's, so they are safe to return and are not logged as failures.
 */
export function apiFail(client: string, status: number): NextResponse {
  return NextResponse.json({ error: client }, { status });
}
