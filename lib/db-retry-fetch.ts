/**
 * fetch for the server's Supabase client that rides out a database API blip.
 *
 * PostgREST answers 503 with one of these codes when it could not even start
 * the query:
 *   PGRST001  could not connect to the database
 *   PGRST002  could not query the database for the schema cache (it reloads the
 *             cache after every schema change — about 4 s of failures on the live
 *             site on 2026-10-10 02:26:53–57 after a one-line ALTER)
 *   PGRST003  timed out acquiring a connection from the pool
 * Nothing ran, so sending the same request again is safe for reads and writes
 * alike. Waits 0.5 s, 1 s, then 2 s; any other answer is returned untouched.
 * Only requests whose body can be sent twice (none, or a string — supabase-js
 * sends JSON strings) are retried; a streamed upload body is passed through.
 */

const RETRY_CODES = new Set(['PGRST001', 'PGRST002', 'PGRST003']);
export const RETRY_DELAYS_MS = [500, 1000, 2000];

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** True when the answer is PostgREST saying the query never started. */
export async function isUnstartedQuery(res: Response): Promise<boolean> {
  if (res.status !== 503) return false;
  try {
    const body = (await res.clone().json()) as { code?: unknown } | null;
    return !!body && typeof body.code === 'string' && RETRY_CODES.has(body.code);
  } catch {
    return false; // not PostgREST's JSON — leave it alone
  }
}

export function withDbRetry(base: Fetch, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Fetch {
  return async (input, init) => {
    const body = init?.body;
    const resendable = body == null || typeof body === 'string';
    let res = await base(input, init);
    if (!resendable) return res;
    for (const ms of RETRY_DELAYS_MS) {
      if (!(await isUnstartedQuery(res))) return res;
      await wait(ms);
      res = await base(input, init);
    }
    return res;
  };
}
