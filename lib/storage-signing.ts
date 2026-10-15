import { createServerClient } from '@/lib/supabase-server';

const PUBLIC_MARKER = '/storage/v1/object/public/';
/* An already-signed URL. saveDocument RETURNS a signed link and several routes
   store what it returns, so rows across the app hold URLs with an hour on them.
   Once that hour is up the link answers
     {"error":"InvalidJWT","message":"\"exp\" claim timestamp check failed"}
   which is what a GC gets clicking PDF on last week's invoice. Being able to
   read the path back out of a signed URL means an expired one can simply be
   re-signed instead of being a dead end. */
const SIGNED_MARKER = '/storage/v1/object/sign/';

/** Pull "<bucket>/<path>" out of a public OR signed storage URL. */
function bucketAndPath(stored: string): { bucket: string; path: string } | null {
  for (const marker of [PUBLIC_MARKER, SIGNED_MARKER]) {
    const i = stored.indexOf(marker);
    if (i < 0) continue;
    const after = stored.slice(i + marker.length);
    const slash = after.indexOf('/');
    if (slash < 0) return null;
    const bucket = after.slice(0, slash);
    let path = after.slice(slash + 1);
    const q = path.indexOf('?');            // drop ?token=… on a signed URL
    if (q >= 0) path = path.slice(0, q);
    try { path = decodeURIComponent(path); } catch { /* sign it as-is */ }
    return { bucket, path };
  }
  return null;
}

/**
 * "<bucket>/<path>" for a stored public or signed storage URL, or null for
 * anything else. Two rows that point at the same object produce the same key,
 * which is how a merged listing (photos + files, files + drawings) tells a
 * second record of one object from a second object.
 */
export function storageObjectKey(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parsed = bucketAndPath(stored);
  return parsed ? `${parsed.bucket}/${parsed.path}` : null;
}

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
const SIGN_TIMEOUT_MS = Number(process.env.STORAGE_SIGN_TIMEOUT_MS || 9000);

/* Signed links this server instance already made, reused until 5 minutes
   before they expire. A list page signs the same files on every visit; going
   back to storage each time is what made a cold list time out. */
const signedCache = new Map<string, { url: string; until: number }>();
function cached(key: string): string | null {
  const hit = signedCache.get(key);
  if (!hit) return null;
  if (hit.until <= Date.now()) { signedCache.delete(key); return null; }
  return hit.url;
}
function remember(key: string, url: string, ttlSeconds: number) {
  if (signedCache.size > 5000) signedCache.clear();
  signedCache.set(key, { url, until: Date.now() + Math.max(0, ttlSeconds - 300) * 1000 });
}

export async function withTimeout<T>(work: Promise<T>, label: string, ms = SIGN_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.error(`[storage-signing] timed out after ${ms}ms: ${label}`);
          resolve(null);
        }, ms);
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
 * The old behavior here was to fall back to the original stored value. For a
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
  const parsed = bucketAndPath(stored);
  if (!parsed) return stored; // foreign URL, demo://, or a bare path — leave it alone
  const { bucket, path } = parsed;
  const hit = cached(`${bucket}/${path}`);
  if (hit) return hit;
  try {
    const res = await withTimeout(
      createServerClient().storage.from(bucket).createSignedUrl(path, ttlSeconds),
      `${bucket}/${path}`,
    );
    if (!res) return reportSigningFailure(bucket, path, 'timed out');
    const { data, error } = res;
    if (error || !data?.signedUrl) return reportSigningFailure(bucket, path, error);
    remember(`${bucket}/${path}`, data.signedUrl, ttlSeconds);
    return data.signedUrl;
  } catch (e: unknown) {
    return reportSigningFailure(bucket, path, e);
  }
}

/**
 * Sign many stored URLs at once: one createSignedUrls call per bucket instead
 * of one call per file. A Files list of 30 documents used to fire 30 parallel
 * signing requests on a cold server; they all timed out together and the
 * whole list failed. Returns stored value -> signed URL ('' when it failed).
 */
async function signMany(values: string[], ttlSeconds: number): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byBucket = new Map<string, Map<string, string[]>>(); // bucket -> path -> stored values
  for (const v of values) {
    const parsed = bucketAndPath(v);
    if (!parsed) { out.set(v, v); continue; }
    const hit = cached(`${parsed.bucket}/${parsed.path}`);
    if (hit) { out.set(v, hit); continue; }
    const paths = byBucket.get(parsed.bucket) || new Map<string, string[]>();
    paths.set(parsed.path, [...(paths.get(parsed.path) || []), v]);
    byBucket.set(parsed.bucket, paths);
  }
  await Promise.all([...byBucket.entries()].map(async ([bucket, paths]) => {
    const list = [...paths.keys()];
    const attempt = () => withTimeout(createServerClient().storage.from(bucket).createSignedUrls(list, ttlSeconds), `${bucket} (${list.length} files)`);
    let res = await attempt().catch(() => null);
    if (!res || res.error) res = await attempt().catch(() => null); // one retry: the first call often pays the cold start
    const signed = new Map<string, string>();
    if (res && !res.error) {
      for (const row of res.data || []) {
        if (row.path && row.signedUrl && !row.error) signed.set(row.path, row.signedUrl);
      }
    }
    for (const [path, stored] of paths) {
      const url = signed.get(path) || '';
      if (url) remember(`${bucket}/${path}`, url, ttlSeconds);
      else reportSigningFailure(bucket, path, res?.error || (res ? 'not returned' : 'timed out'));
      for (const s of stored) out.set(s, url);
    }
  }));
  return out;
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
  const values = new Set<string>();
  for (const r of rows) for (const f of fields) { const v = r[f]; if (typeof v === 'string' && v) values.add(v); }
  const map = await signMany([...values], ttlSeconds);
  const signed = rows.map((r) => {
    const out: Record<string, any> = { ...r };
    for (const f of fields) {
      const before = out[f];
      if (typeof before !== 'string' || !before) continue;
      const after = map.get(before) ?? '';
      if (!after) failures.push(`${f} on row ${String(out.id ?? '?')}`);
      out[f] = after;
    }
    return out as T;
  });
  if (strict && failures.length) {
    throw new Error(
      `storage signing failed for ${failures.length} field(s): ${failures.slice(0, 5).join(', ')}${failures.length > 5 ? ', …' : ''}`,
    );
  }
  return signed;
}
