/**
 * Writes that cannot fail quietly.
 *
 * supabase-js does not throw when the database refuses a write. It resolves
 * with `{ data, error }`. So this:
 *
 *     await db.from('time_entries').insert(row);
 *
 * fails completely silently — no exception, no log line, nothing for a
 * try/catch to catch. The dialog closes, the list reloads, the row is not
 * there, and the screen already said it saved. That is the shape of the
 * complaint "I entered it and it didn't save", and it was live on the payroll
 * screen: a rejected timesheet insert printed "Week submitted for approval".
 *
 * Two helpers, because a refused write does not always mean the same thing:
 *
 *   must()      the user is waiting on this. If the database says no, throw,
 *               so the route's catch turns it into a real error response and
 *               the screen tells the truth.
 *
 *   tryWrite()  a write on a path that is already failing, or a status flag
 *               being set on the way out. Throwing here would replace the real
 *               error with this one. Log it and carry on — but log it, because
 *               a takeoff stuck on "analyzing" forever has no other
 *               explanation.
 *
 * Both return the full result, so an existing `.select()` or a used return
 * value keeps working:
 *
 *     const { data } = await must(db.from('x').insert(row).select(), 'x');
 */

/** The shape every supabase-js builder resolves to. */
interface WriteResult {
  error: { message?: string; code?: string; details?: string; hint?: string } | null;
}

function describe(what: string, error: NonNullable<WriteResult['error']>): string {
  const bits = [error.code, error.message, error.details].filter(Boolean);
  return `[db] ${what} was refused: ${bits.join(' — ') || 'unknown error'}`;
}

/**
 * Await a write and throw if the database refused it.
 *
 * Use for anything the user is waiting on. The thrown error carries the
 * Postgres code and message for the server log; what reaches the browser is
 * whatever the route's catch decides — `apiError()` in an API route, which
 * logs the real thing against a correlation id and returns wording safe to
 * show a GC.
 */
export async function must<T extends WriteResult>(query: PromiseLike<T>, what: string): Promise<T> {
  const res = await query;
  if (res.error) {
    const e = new Error(describe(what, res.error));
    /* Keep the original so callers that inspect .code still can. */
    (e as Error & { cause?: unknown }).cause = res.error;
    throw e;
  }
  return res;
}

/**
 * Await a write, log if the database refused it, never throw.
 *
 * For writes inside a catch, or a status flag set while bailing out. If this
 * one also fails there is nothing useful to tell the user — but the row is now
 * stuck in the wrong state, and without this line nothing anywhere says why.
 */
export async function tryWrite<T extends WriteResult>(query: PromiseLike<T>, what: string): Promise<T> {
  const res = await query;
  if (res.error) console.error(describe(what, res.error));
  return res;
}
