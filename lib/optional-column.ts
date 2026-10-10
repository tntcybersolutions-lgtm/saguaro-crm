/**
 * Writes that carry a column the live database may not have yet.
 *
 * A few screens collect a field whose column is waiting on a migration (the
 * invitee's name on team_invites, for one). Sending that column before the
 * migration runs makes PostgREST refuse the WHOLE write — the row is lost, not
 * just the field. Leaving the field out until the migration runs loses what the
 * user typed even after it lands.
 *
 * writeWithOptionalColumns() sends the row with the optional columns, and only
 * if the database answers "no such column" for one of them does it drop that
 * one column and try again. Every other error is returned untouched, so a real
 * refusal still reaches the route's catch. Once the column exists the first
 * attempt simply succeeds and nothing is dropped.
 */

/** Minimal shape of a supabase-js / PostgREST error. */
export interface DbError { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when `error` is the database saying `column` does not exist.
 *   PGRST204 — insert/update named a column missing from the schema cache:
 *              "Could not find the 'name' column of 'team_invites' in the schema cache"
 *   42703    — Postgres undefined_column: "column team_invites.name does not exist"
 */
export function isMissingColumn(error: DbError | null | undefined, column: string): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  if (code !== 'PGRST204' && code !== '42703') return false;
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  const col = escapeRe(column);
  // 'name' | "name" | table.name — the column must be named exactly, not as part of a longer one.
  return new RegExp(`(['"]${col}['"])|(\\.${col}\\b)|(column ${col}\\b)`).test(text);
}

/**
 * Run `write(row)`; if the database refuses it only because one of `optional`
 * columns is missing, retry without that column. Returns the final result plus
 * the columns that had to be dropped (empty once the migration has run).
 */
export async function writeWithOptionalColumns<R extends { error: DbError | null }>(
  row: Record<string, unknown>,
  optional: string[],
  write: (row: Record<string, unknown>) => PromiseLike<R>,
): Promise<{ result: R; dropped: string[] }> {
  let current = { ...row };
  const dropped: string[] = [];
  // At most one retry per optional column — never an unbounded loop.
  for (let i = 0; i <= optional.length; i++) {
    const result = await write(current);
    const missing = optional.find((c) => c in current && isMissingColumn(result.error, c));
    if (!missing) return { result, dropped };
    const next = { ...current };
    delete next[missing];
    current = next;
    dropped.push(missing);
  }
  // Unreachable in practice (each pass removes a column); kept for the type checker.
  return { result: await write(current), dropped };
}
