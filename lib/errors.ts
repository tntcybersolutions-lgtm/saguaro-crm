// Shared, client-safe helper for turning thrown errors / API error payloads into
// SHORT, HUMAN, non-leaky messages that are safe to show in the UI.
//
// It never surfaces PostgREST codes (PGRST…), raw SQL constraint text, HTTP status
// numbers, JWT internals, JSON blobs, or stack frames to end users. Genuinely human
// messages (e.g. "Enter your name first.") pass through unchanged; anything that looks
// technical is replaced with a clean, contextual fallback the caller provides.
//
// Usage:
//   catch (e) { console.error(e); setError(humanError(e, "Couldn't save the estimate.")); }
//
// Always keep the console.error(e) for developers — humanError is for the UI only.

/** Pull a best-effort raw message string out of any thrown value or API payload. */
function extractMessage(e: unknown): string {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || '';
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.error === 'string' && o.error) return o.error;
    const nested = o.error as Record<string, unknown> | undefined;
    if (nested && typeof nested.message === 'string' && nested.message) return nested.message;
    if (typeof o.msg === 'string' && o.msg) return o.msg;
    if (typeof o.hint === 'string' && o.hint) return o.hint;
  }
  return '';
}

/** True when a message looks like something we should NOT show a customer verbatim. */
function isLeaky(msg: string): boolean {
  return (
    /PGRST\d*/i.test(msg) ||
    /\bviolates?\b.*\b(row-level security|constraint|policy)\b/i.test(msg) ||
    /duplicate key value|not-null constraint|foreign key constraint|check constraint|unique constraint/i.test(msg) ||
    /column .* does not exist|relation .* does not exist|schema .* does not exist/i.test(msg) ||
    /invalid input syntax|null value in column|permission denied for/i.test(msg) ||
    /\bJW[ST]\b|refresh token|auth session|access token/i.test(msg) ||
    /\bhttp\b[^a-z]*\d{3}\b/i.test(msg) ||
    /\b(status|code)\b[^a-z]{0,4}\d{3}\b/i.test(msg) ||
    /\bserver\s+\d{3}\b/i.test(msg) ||
    /\b(5\d\d|4\d\d)\b\s*(error|status|response)/i.test(msg) ||
    /\bE(CONN|TIMEDOUT|NOTFOUND|CONNREFUSED)\b/i.test(msg) ||
    /\bat\s+\S+\s*\(?\S*:\d+:\d+\)?/.test(msg) || // stack frame
    /^\s*[[{]/.test(msg) ||                        // JSON blob
    /supabase|postgres|pg_|sql\b/i.test(msg) ||
    msg.length > 180
  );
}

/**
 * Convert any error into a clean, human message safe for the UI.
 * @param e         the caught error / API payload (unknown)
 * @param fallback  contextual message to use when the raw error is technical/empty
 */
export function humanError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = extractMessage(e).trim();
  if (!raw) return fallback;

  // The server's own refusal already names what was refused — keep its words.
  if (/^you don't have permission to /i.test(raw) && raw.length < 200) return raw;
  // A body that was not JSON (a proxy's "upstream request failed" page) must
  // never reach the screen as a parse error.
  if (/Unexpected token|is not valid JSON|JSON\.parse|Unexpected end of JSON/i.test(raw)) return fallback;
  // "Unauthorized" from our API means the session is gone, not a refusal.
  if (/^unauthori[sz]ed$/i.test(raw)) return 'Your session expired. Sign in again to continue.';

  // Map common technical failures to friendly, actionable guidance.
  if (/violates? row-level security|permission denied|not authorized|forbidden|not allowed/i.test(raw))
    return "You don't have permission to do this. Ask your company admin for access.";
  if (/duplicate key value|already exists|violates? unique constraint/i.test(raw))
    return 'That already exists.';
  if (/violates? foreign key constraint/i.test(raw))
    return "That item is still in use elsewhere and can't be changed right now.";
  if (/not-null constraint|null value in column|invalid input syntax|violates? check constraint/i.test(raw))
    return 'Some required information is missing or invalid.';
  if (/\bJW[ST]\b|token .*expired|expired .*token|not authenticated|auth session (missing|expired)|refresh token/i.test(raw))
    return 'Your session expired. Please sign in again.';
  if (/failed to fetch|networkerror|network request failed|\bE(CONN|TIMEDOUT|NOTFOUND|CONNREFUSED)\b|network error/i.test(raw))
    return 'Network problem — check your connection and try again.';
  if (/rate limit|too many requests|429/i.test(raw))
    return 'Too many requests — please wait a moment and try again.';
  if (/timeout|timed out|deadline exceeded/i.test(raw))
    return 'That took too long. Please try again.';
  if (/payload too large|413|file too large|request entity too large/i.test(raw))
    return 'That file is too large. Try a smaller file.';

  // Anything that still reads as technical → use the caller's contextual fallback.
  if (isLeaky(raw)) return fallback;

  return raw;
}

export default humanError;
