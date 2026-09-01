import { createServerClient } from '@/lib/supabase-server';

const PUBLIC_MARKER = '/storage/v1/object/public/';

/**
 * No signing call may hang a request.
 *
 * Every read path that signs is on a page's critical load path, and
 * createSignedUrl is a network call with no timeout of its own. When the
 * storage API stalled, the route never returned, the browser never finished
 * loading, and the takeoff screen simply sat there forever — no error, no spinner
 * that ever resolved, nothing in the logs. An unbounded call on a load path is
 * the defect; a slow signer must degrade to a broken link, never to a dead page.
 */
const SIGN_TIMEOUT_MS = Number(process.env.STORAGE_SIGN_TIMEOUT_MS || 4000);

async function withTimeout<T>(work: Promise<T>, label: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.error(`[storage-signing] timed out after ${SIGN_TIMEOUT_MS}ms: ${label}`);
          resolve(null);
        }, SIGN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Derive the bucket-relative object path from a stored value. Handles:
 *  - a Supabase PUBLIC url (legacy rows): ".../object/public/<bucket>/<path>"
 *  - a bare path already (forward-compatible)
 * Returns null for values we can't sign (demo://, foreign URLs).
 */
export function pathFromStored(stored: string | null | undefined, bucket: string): string | null {
  if (!stored) return null;
  const i = stored.indexOf(PUBLIC_MARKER);
  if (i >= 0) {
    const after = stored.slice(i + PUBLIC_MARKER.length); // "<bucket>/<path>"
    const slash = after.indexOf('/');
    if (slash >= 0) return after.slice(slash + 1);
    return after;
  }
  if (stored.startsWith('http') || stored.startsWith('demo://') || stored.startsWith('blob:')) return null;
  return stored; // already a path
}

/**
 * A signing failure must NEVER be returned as if it were a signed URL.
 *
 * The old behaviour here was to fall back to the original stored value. For a
 * demo:// or foreign URL that is correct — but for a Supabase PUBLIC url the
 * buckets are private, so the fallback handed back a URL that *looks* valid and
 * then 400s on fetch. That is the same failure mode as Supabase's unlicensed
 * image-transform endpoint: HTTP 200, a plausible URL, and nothing usable at the
 * other end. It produces broken images with no error anywhere in the logs.
 *
 * So when we positively identified an object we were supposed to sign and the
 * signing failed, we log it with the bucket and path and return '' — an empty
 * string a caller can actually test for, instead of a decoy.
 */
function reportSigningFailure(bucket: string, path: string, reason: unknown): '' {
  const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : JSON.stringify(reason);
  console.error(`[storage-signing] could not sign ${bucket}/${path}: ${msg || 'no signed URL returned'}`);
  return '';
}

/**
 * Return a short-lived signed URL for a private-bucket object, given either a
 * legacy public URL or a path. Values we can't sign at all (demo://, foreign
 * URLs) pass through unchanged; values we *should* have signed but couldn't come
 * back as '' with an error logged. Centralizes the public-bucket -> signed-URL
 * migration.
 */
export async function signStoredUrl(
  bucket: string,
  stored: string | null | undefined,
  ttlSeconds = 3600,
): Promise<string> {
  const path = pathFromStored(stored, bucket);
  if (!path) return stored ?? '';
  try {
    const res = await withTimeout(
      createServerClient().storage.from(bucket).createSignedUrl(path, ttlSeconds),
      `${bucket}/${path}`,
    );
    if (!res) return reportSigningFailure(bucket, path, 'timed out');
    const { data, error } = res;
    if (error || !data?.signedUrl) return reportSigningFailure(bucket, path, error);
    return data.signedUrl;
  } catch (e: unknown) {
    return reportSigningFailure(bucket, path, e);
  }
}

/**
 * Bucket-auto-detecting signer for READ paths: takes a stored Supabase PUBLIC
 * url, parses "<bucket>/<path>" out of it, and returns a short-lived signed
 * URL. Anything that isn't a recognizable public Supabase URL (already-signed,
 * foreign, demo://, empty) is returned unchanged. Use this to migrate any read
 * site to private buckets without hard-coding the bucket name.
 */
export async function signUrl(stored: string | null | undefined, ttlSeconds = 3600): Promise<string> {
  if (!stored) return stored ?? '';
  const i = stored.indexOf(PUBLIC_MARKER);
  if (i < 0) return stored; // not a public-bucket URL (signed/foreign/path) — leave as-is
  const after = stored.slice(i + PUBLIC_MARKER.length); // "<bucket>/<path>"
  const slash = after.indexOf('/');
  if (slash < 0) return stored;
  const bucket = after.slice(0, slash);
  // A public URL percent-encodes the object path; the storage API wants it raw.
  let path = after.slice(slash + 1);
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  try {
    path = decodeURIComponent(path);
  } catch {
    /* not valid percent-encoding — sign it as-is */
  }
  try {
    const res = await withTimeout(
      createServerClient().storage.from(bucket).createSignedUrl(path, ttlSeconds),
      `${bucket}/${path}`,
    );
    if (!res) return reportSigningFailure(bucket, path, 'timed out');
    const { data, error } = res;
    if (error || !data?.signedUrl) return reportSigningFailure(bucket, path, error);
    return data.signedUrl;
  } catch (e: unknown) {
    return reportSigningFailure(bucket, path, e);
  }
}

/**
 * Map an array of records, signing the given URL field(s) on each.
 *
 * STRICT BY DEFAULT: if a field we were supposed to sign comes back unsigned,
 * this throws instead of returning a list full of URLs that 400 on load. Every
 * caller is inside a try/catch that turns it into an honest error response, and
 * a gallery that says "couldn't load, retry" is worth more than a grid of broken
 * tiles that looks like the photos themselves are gone.
 *
 * Fields that are absent, null, or non-string are left alone — a row with no
 * thumbnail_url is missing data, not a signing failure, and the client falls
 * back to the full-size url.
 *
 * Pass `{ strict: false }` for a surface where partial results genuinely beat an
 * error; failures are still logged and still yield '' rather than a decoy URL.
 */
export async function signFields<T extends Record<string, any>>(
  rows: T[],
  fields: string[],
  ttlSeconds = 3600,
  opts: { strict?: boolean } = {},
): Promise<T[]> {
  const strict = opts.strict !== false;
  const failures: string[] = [];
  const signed = await Promise.all(
    rows.map(async (r) => {
      const out: Record<string, any> = { ...r };
      for (const f of fields) {
        const before = out[f];
        if (typeof before !== 'string' || !before) continue;
        const after = await signUrl(before, ttlSeconds);
        if (!after) failures.push(`${f} on row ${String(out.id ?? '?')}`);
        out[f] = after;
      }
      return out as T;
    }),
  );
  if (strict && failures.length) {
    throw new Error(
      `storage signing failed for ${failures.length} field(s): ${failures.slice(0, 5).join(', ')}${failures.length > 5 ? ', …' : ''}`,
    );
  }
  return signed;
}
