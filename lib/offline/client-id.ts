/**
 * The id a phone gives a record before the server has seen it.
 *
 * A write kept on the phone with no signal can reach the server more than once:
 * the first send got there, the answer never came back, so the phone sends it
 * again. Every send of that write carries the same id (header CLIENT_ID_HEADER),
 * and the routes that create rows — daily logs, clock in/out, photos, videos — store it
 * in a `client_id` column with a unique (tenant_id, client_id) index. A second
 * send finds the row the first one made and returns it instead of writing
 * another. Shared by the browser (outbox, uploads) and the routes.
 */
export const CLIENT_ID_HEADER = 'x-saguaro-client-id';

const OK = /^[A-Za-z0-9_-]{8,80}$/;

/** A fresh id for one write. */
export function newClientId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The client id a request carries (header first, then body.clientId), or null. Anything odd-looking is ignored. */
export function readClientId(headers: Headers, body?: unknown): string | null {
  const fromHeader = headers.get(CLIENT_ID_HEADER);
  const fromBody = body && typeof body === 'object' ? (body as { clientId?: unknown }).clientId : undefined;
  const raw = (fromHeader ?? (typeof fromBody === 'string' ? fromBody : '') ?? '').trim();
  return OK.test(raw) ? raw : null;
}

/* One id per picked file, so a photo whose upload dies mid-way and is then kept
   on the phone carries the same id it was first sent with. */
const perFile = new WeakMap<object, string>();
export function clientIdFor(file: object): string {
  let id = perFile.get(file);
  if (!id) { id = newClientId(); perFile.set(file, id); }
  return id;
}

/** A Postgres unique-violation (a second send of a write the server already has). */
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === '23505';
}
