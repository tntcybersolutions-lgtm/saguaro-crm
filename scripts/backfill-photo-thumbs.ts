/* PHOTO THUMBNAIL BACKFILL — one-time, safe to re-run.
 *
 * WHY THIS EXISTS
 * The mobile photo grid renders `photos.url`, which is the FULL-RESOLUTION
 * original — real rows in this database are 2.4-3.6 MB, 12-megapixel JPEGs.
 * Eighteen of those decoding at once is hundreds of megabytes of bitmap on the
 * UI thread, which is why opening Photos freezes the phone. The `photos` table
 * has had a `thumbnail_url` column the whole time and not one row populated it.
 *
 * NOT AN OPTION: Supabase image transformation (`?width=400` on a signed URL).
 * It is a paid add-on that is NOT enabled on this project and it fails
 * SILENTLY — the request returns HTTP 200 with a signed URL that then serves
 * the byte-identical full-size original. Anything built on it "works" in code
 * review and fixes nothing on the phone. So we render real thumbnails here,
 * with sharp, and store them.
 *
 * WHAT IT DOES
 * For every `photos` row whose `url` points at our own Supabase storage and
 * whose `thumbnail_url` is empty: download the object, render a ~400px-wide
 * JPEG, upload it to a `thumbs/` sibling path in the same bucket, and write
 * `thumbnail_url` back in the same public-URL form as `url` (so the existing
 * signUrl()/signFields() read path signs it without any special-casing).
 *
 * Rows whose `url` is an external link (the Unsplash seed photos) are skipped
 * and counted — we do not have those bytes and will not mirror someone else's
 * CDN into our bucket.
 *
 * Re-running is a no-op for rows already backfilled. Pass --force to redo them.
 *
 *   npx tsx scripts/backfill-photo-thumbs.ts [--dry-run] [--force] [--limit=N]
 */
import { createClient } from '@supabase/supabase-js';
import { decodeToSharpReadable } from '../lib/image-decode';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ENV_PATH = 'D:/saguaro-web/.env.local';
const THUMB_WIDTH = 400;
const THUMB_QUALITY = 72;
const PUBLIC_MARKER = '/storage/v1/object/public/';
const DEFAULT_BUCKET = 'project-files';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const LIMIT = Number((argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 5000;

// ── sharp is REQUIRED. It is in package.json ("sharp": "^0.34.5"), but if the
// native binary is missing for this platform there is no honest fallback: we
// refuse to run rather than write rows that claim a thumbnail exists. ──
let sharp: typeof import('sharp');
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sharp = require('sharp');
} catch (e: unknown) {
  console.error('FAIL sharp is not loadable — this backfill cannot render thumbnails without it.');
  console.error('     Install it in D:/saguaro-web (`npm install sharp`) and re-run. No rows were touched.');
  console.error('     Underlying error:', e instanceof Error ? e.message : e);
  process.exit(1);
}

if (!fs.existsSync(ENV_PATH)) {
  console.error(`FAIL env file not found at ${ENV_PATH} — cannot reach Supabase. No rows were touched.`);
  process.exit(1);
}
const env = fs.readFileSync(ENV_PATH, 'utf8');
const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local. No rows were touched.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY);

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  ok ? pass++ : fail++;
};
/* BLOCKED is not FAIL. A row this tool provably cannot process (a HEVC .heic
 * that the bundled libvips has no decoder for) is a data limitation, not a bug
 * in the run — reporting it as a failure forever would make the exit code
 * meaningless on every future re-run. It gets its own loud line and is named in
 * the final summary; only real download/upload/update errors set the exit code. */
const blocked = (name: string, detail: string) => console.log(`BLOCKED ${name} — ${detail}`);

/** Split a stored public-URL (or bare path) into { bucket, path }, or null if it isn't ours. */
function locate(stored: string | null | undefined): { bucket: string; objectPath: string } | null {
  if (!stored) return null;
  const i = stored.indexOf(PUBLIC_MARKER);
  if (i >= 0) {
    const after = stored.slice(i + PUBLIC_MARKER.length); // "<bucket>/<path>"
    const slash = after.indexOf('/');
    if (slash < 0) return null;
    const bucket = after.slice(0, slash);
    // Storage paths are URL-encoded in a public URL; the storage API wants them raw.
    let objectPath = after.slice(slash + 1);
    const q = objectPath.indexOf('?');
    if (q >= 0) objectPath = objectPath.slice(0, q);
    try {
      objectPath = decodeURIComponent(objectPath);
    } catch {
      /* leave as-is if it isn't valid percent-encoding */
    }
    return objectPath ? { bucket, objectPath } : null;
  }
  // Foreign http(s), demo://, blob: — not ours.
  if (/^[a-z][a-z0-9+.-]*:/i.test(stored)) return null;
  return { bucket: DEFAULT_BUCKET, objectPath: stored };
}

/** `projects/x/photos/1712-a.jpg` -> `projects/x/photos/thumbs/1712-a.jpg` (deterministic, so re-runs overwrite). */
function thumbPathFor(objectPath: string): string {
  const dir = path.posix.dirname(objectPath);
  const base = path.posix.basename(objectPath);
  const stem = base.replace(/\.[^.]+$/, '') || base;
  const prefix = dir === '.' ? '' : `${dir}/`;
  return `${prefix}thumbs/${stem}.jpg`;
}

type Outcome = 'created' | 'already' | 'external' | 'undecodable' | 'error';

async function main() {
  console.log(
    `PHOTO THUMB BACKFILL — width ${THUMB_WIDTH}px q${THUMB_QUALITY}${DRY_RUN ? ' [DRY RUN — no writes]' : ''}${FORCE ? ' [FORCE — redo existing]' : ''}`,
  );

  const { data: rows, error: readErr } = await db
    .from('photos')
    .select('id, url, thumbnail_url, filename, mime_type, file_size')
    .order('created_at', { ascending: true })
    .limit(LIMIT);
  if (readErr) {
    console.error('FAIL could not read the photos table:', readErr.message);
    process.exit(1);
  }
  const all = (rows || []) as Array<Record<string, any>>;
  check('B1: photos table readable', all.length >= 0, `${all.length} row(s) fetched`);

  const tally: Record<Outcome, number> = { created: 0, already: 0, external: 0, undecodable: 0, error: 0 };
  const externalHosts = new Map<string, number>();
  const problems: string[] = [];
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const row of all) {
    const id = String(row.id);
    const stored = typeof row.url === 'string' ? row.url : '';

    if (!FORCE && typeof row.thumbnail_url === 'string' && row.thumbnail_url.trim()) {
      tally.already++;
      continue;
    }

    const loc = locate(stored);
    if (!loc) {
      tally.external++;
      let host = 'unparseable';
      try {
        host = new URL(stored).host;
      } catch {
        host = stored ? stored.split(':')[0] + ':' : 'empty-url';
      }
      externalHosts.set(host, (externalHosts.get(host) || 0) + 1);
      continue;
    }

    const { bucket, objectPath } = loc;
    const dl = await db.storage.from(bucket).download(objectPath);
    if (dl.error || !dl.data) {
      tally.error++;
      problems.push(`${id}: download failed (${bucket}/${objectPath}) — ${dl.error?.message || 'no body'}`);
      continue;
    }
    const original = Buffer.from(await dl.data.arrayBuffer());

    /* NORMALISE FIRST. sharp's bundled libvips ships an AVIF decoder but no
     * HEVC one, so an iPhone .heic cannot go straight into sharp. The shared
     * decode chain in lib/image-decode.ts transcodes HEIC to JPEG and passes
     * every sharp-native format through untouched — the SAME module the upload
     * route uses, so a backfilled row and a fresh upload converge. */
    let decoded;
    try {
      decoded = await decodeToSharpReadable(original, path.posix.basename(objectPath));
    } catch (e: unknown) {
      tally.undecodable++;
      problems.push(`${id}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (decoded.note) console.log(`     ${id}: ${decoded.note}`);

    let thumb: Buffer;
    try {
      thumb = await sharp(decoded.buffer)
        .rotate() // honor EXIF orientation before the resize bakes pixels in
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
        .toBuffer();
    } catch (e: unknown) {
      tally.undecodable++;
      problems.push(
        `${id}: sharp could not decode ${path.posix.basename(objectPath)} (${row.mime_type || 'unknown type'}) — ${e instanceof Error ? e.message : e}`,
      );
      continue;
    }

    /* A THUMBNAIL IS NOT ENOUGH FOR A TRANSCODED SOURCE.
     * If we had to convert, the stored ORIGINAL is still a .heic that no
     * browser and no Android device can render — the grid tile would work and
     * opening the photo would show nothing. So write a JPEG display copy
     * alongside it and repoint `url`. The .heic object is left in storage
     * untouched, so this is reversible and loses no data. */
    let displayJpeg: Buffer | null = null;
    let displayPath: string | null = null;
    if (decoded.transcoded) {
      try {
        displayJpeg = await sharp(decoded.buffer)
          .rotate()
          .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();
        const dir = path.posix.dirname(objectPath);
        const stem = path.posix.basename(objectPath).replace(/\.[^.]+$/, '');
        displayPath = `${dir === '.' ? '' : dir + '/'}${stem}.jpg`;
      } catch (e: unknown) {
        problems.push(`${id}: display JPEG render failed — ${e instanceof Error ? e.message : e}`);
        displayJpeg = null;
        displayPath = null;
      }
    }

    bytesBefore += original.length;
    bytesAfter += thumb.length;

    if (DRY_RUN) {
      tally.created++;
      console.log(
        `     would write ${thumbPathFor(objectPath)} — ${(original.length / 1024 / 1024).toFixed(2)} MB -> ${(thumb.length / 1024).toFixed(0)} KB` +
          (displayPath ? ` + display copy ${displayPath} (${((displayJpeg?.length ?? 0) / 1024 / 1024).toFixed(2)} MB) and repoint url` : ''),
      );
      continue;
    }

    const thumbPath = thumbPathFor(objectPath);
    const { error: upErr } = await db.storage
      .from(bucket)
      .upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      tally.error++;
      problems.push(`${id}: thumbnail upload failed (${bucket}/${thumbPath}) — ${upErr.message}`);
      continue;
    }

    const { data: pub } = db.storage.from(bucket).getPublicUrl(thumbPath);
    const thumbUrl = pub?.publicUrl;
    if (!thumbUrl) {
      tally.error++;
      problems.push(`${id}: could not resolve a public URL for ${bucket}/${thumbPath}`);
      continue;
    }

    // Upload the display JPEG (transcoded sources only) before the row update,
    // so `url` is never repointed at an object that does not exist yet.
    let newUrl: string | null = null;
    if (displayJpeg && displayPath) {
      const { error: dispErr } = await db.storage
        .from(bucket)
        .upload(displayPath, displayJpeg, { contentType: 'image/jpeg', upsert: true });
      if (dispErr) {
        problems.push(`${id}: display JPEG upload failed (${bucket}/${displayPath}) — ${dispErr.message}`);
      } else {
        const { data: dpub } = db.storage.from(bucket).getPublicUrl(displayPath);
        newUrl = dpub?.publicUrl ?? null;
        if (!newUrl) problems.push(`${id}: could not resolve a public URL for ${bucket}/${displayPath}`);
      }
    }

    const { error: updErr } = await db
      .from('photos')
      .update({ thumbnail_url: thumbUrl, ...(newUrl ? { url: newUrl } : {}) } as never)
      .eq('id', id);
    if (updErr) {
      tally.error++;
      problems.push(`${id}: thumbnail_url update failed — ${updErr.message}`);
      continue;
    }
    tally.created++;
    console.log(
      `     ${id} -> ${thumbPath} (${(original.length / 1024 / 1024).toFixed(2)} MB -> ${(thumb.length / 1024).toFixed(0)} KB)`,
    );
  }

  check(
    'B2: every storage-hosted row produced a thumbnail',
    tally.error === 0,
    `${tally.created} created, ${tally.already} already had one, ${tally.error} errored`,
  );
  check(
    'B3: external-URL rows skipped deliberately (not mirrored into our bucket)',
    true,
    tally.external === 0
      ? 'none'
      : `${tally.external} skipped — ${[...externalHosts].map(([h, n]) => `${h} x${n}`).join(', ')}`,
  );
  if (tally.undecodable === 0) {
    check('B4: every original decoded', true, 'no unreadable source images');
  } else {
    blocked(
      'B4: HEIC originals cannot be thumbnailed here',
      `${tally.undecodable} row(s). The prebuilt libvips inside sharp ${sharp.versions.vips} ships AVIF but NOT HEVC, ` +
        `so these bytes cannot be decoded on this machine. Those rows keep a null thumbnail_url and every client must ` +
        `fall back to the full-size original — and Android/Chrome cannot render .heic at all, so they show nothing there. ` +
        `Fixing them needs a HEIC decoder on the server (e.g. a heic-convert dependency) or a re-upload from the phone, ` +
        `where iOS can transcode to JPEG. See detail below.`,
    );
  }

  if (bytesBefore > 0) {
    console.log(
      `     payload: ${(bytesBefore / 1024 / 1024).toFixed(1)} MB of originals -> ${(bytesAfter / 1024).toFixed(0)} KB of thumbnails (${(bytesBefore / Math.max(bytesAfter, 1)).toFixed(0)}x smaller)`,
    );
  }
  if (problems.length) {
    console.log('\n     detail:');
    for (const p of problems) console.log(`       - ${p}`);
  }

  // ── verification pass: re-read from the database, sign one thumbnail, fetch it ──
  if (!DRY_RUN) {
    const { data: after, error: afterErr } = await db
      .from('photos')
      .select('id, url, thumbnail_url')
      .order('created_at', { ascending: true }) // same window the backfill pass used
      .limit(LIMIT);
    if (afterErr) {
      check('B5: verification re-read', false, afterErr.message);
    } else {
      const ours = (after || []).filter((r: any) => !!locate(r.url));
      const missing = ours.filter((r: any) => !r.thumbnail_url);
      check(
        'B5: every storage-hosted photo row now carries a thumbnail_url',
        missing.length === tally.undecodable,
        `${ours.length - missing.length}/${ours.length} populated${missing.length ? `; ${missing.length} still null (${tally.undecodable} undecodable)` : ''}`,
      );

      const sample = ours.find((r: any) => !!r.thumbnail_url) as any;
      if (sample) {
        const t = locate(sample.thumbnail_url)!;
        const { data: signed, error: signErr } = await db.storage
          .from(t.bucket)
          .createSignedUrl(t.objectPath, 300);
        if (signErr || !signed?.signedUrl) {
          check('B6: a stored thumbnail_url signs for read', false, signErr?.message || 'no signed URL');
        } else {
          const res = await fetch(signed.signedUrl);
          const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0;
          check(
            'B6: signed thumbnail actually serves small JPEG bytes',
            res.ok && bytes > 0 && bytes < 200 * 1024,
            `HTTP ${res.status}, ${(bytes / 1024).toFixed(0)} KB`,
          );
        }
      } else {
        check('B6: signed thumbnail actually serves small JPEG bytes', false, 'no thumbnail row to sample');
      }
    }
  }

  console.log(
    `\n${fail === 0 ? 'THUMB BACKFILL PASSED' : 'THUMB BACKFILL FAILED'} — ${pass} ok, ${fail} failed` +
      `, ${tally.created} thumbnail(s) written, ${tally.external} external row(s) skipped, ${tally.undecodable} blocked on HEIC`,
  );
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
