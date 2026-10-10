/**
 * Text from a request, made safe to place inside a PostgREST filter string
 * such as `.or(\`name.ilike.%${v}%,email.ilike.%${v}%\`)`.
 *
 * Inside or()/and() a comma starts another condition and parentheses open or
 * close a group, so a search for `x,tenant_id.neq.0` or a cost code of
 * `1,id.neq.0` added a condition of the caller's choosing (the tenant filter
 * is ANDed outside, so it stayed within the company, but it could match the
 * wrong budget line). Those characters, quotes and backslashes become spaces.
 * Dots stay — emails and cost codes like 03.300 were already sent with them.
 */
export function orValue(v: unknown): string {
  return String(v ?? '').replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
