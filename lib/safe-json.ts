/**
 * safeJsonParse — JSON.parse that never throws.
 *
 * Client code that reads localStorage/sessionStorage with `JSON.parse(... || '[]')`
 * still crashes the whole component if the stored value is corrupt (a partial
 * write, a schema change between app versions, or manual tampering): the `||`
 * only guards `null`, not a malformed string. This returns the fallback on any
 * parse error instead.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
