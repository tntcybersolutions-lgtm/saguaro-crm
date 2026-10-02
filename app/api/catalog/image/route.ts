import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { isPlatformAdmin } from '@/lib/platform-admin';
import { apiError } from '@/lib/api-error';

/** /api/catalog/image — attach a REAL product image to a materials-catalog item.
 *
 *  HONESTY DOCTRINE: the server never guesses, generates, or hotlinks images.
 *  Every image on a catalog row arrives from a human with Projects/Full:
 *
 *   POST multipart/form-data {itemId, file}
 *     Admin uploads an actual product photo → stored in the 'project-files'
 *     bucket under catalog/<itemId>/, public URL written onto the row.
 *     Validation: PNG/JPEG/WebP/GIF only, 5MB cap. Returns {imageUrl}.
 *
 *   POST application/json {itemId, imageUrl}
 *     Bulk/paste path — admin supplies a real manufacturer/vendor image URL
 *     (honest sourcing). Basic http(s) URL validation. Returns {imageUrl}.
 *
 *   PATCH {itemId, imageUrl | null}
 *     Minimal catalog image update path (the catalog has no other update
 *     route) — sets or clears image_url on the row.
 *
 *  ⚠️ THIS ROUTE WROTE TO OTHER TENANTS' SCREENS.
 *
 *  Catalog rows are a shared GLOBAL reference dataset — all 890 of them have
 *  tenant_id IS NULL — and this route took "shared" to mean "unscoped". Any
 *  signed-in user holding Projects/Full in their OWN company could point a
 *  global catalog row's image at any URL they liked, and every other contractor
 *  on the platform would then render it. Projects/Full is a permission inside a
 *  tenant; it is not a license to edit rows the whole platform reads.
 *
 *  The rule now matches who owns the row:
 *    tenant_id IS NULL  →  the shared catalog. Platform admins only
 *                          (PLATFORM_ADMIN_EMAILS), because a write here is a
 *                          write to every tenant's screen.
 *    tenant_id = yours  →  your own catalog entry. Projects/Full is enough.
 *    anything else      →  404. Another tenant's row is not visible, so it
 *                          cannot be probed for existence either.
 *
 *  Two live defects went with it, because an upload nobody could see is an
 *  upload nobody reported:
 *    - it built its storage client from NEXT_PUBLIC_SUPABASE_ANON_KEY — the key
 *      that ships in the browser bundle — instead of the service role every
 *      other upload route in this codebase uses;
 *    - it saved getPublicUrl() against 'project-files', which is PRIVATE, so
 *      the stored link answered 400 and the photo never rendered. The path is
 *      stored now and /api/catalog signs it on read, the same way files and
 *      photos already work.
 *
 *  The doc comment here used to say image_url was a pending migration. It is
 *  not — verified on production 24 Sep 2026, catalog_items carries image_url
 *  today. Nothing was holding the broken write back. The 409 path stays as the
 *  honest answer if a column ever goes missing, rather than a write that
 *  reports success and saves nothing.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/** Basic URL validation for the paste path: http(s), parseable, dotted host. */
function validHttpUrl(raw: string): string | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

type WriteFailure = { status: number; error: string };

/** The storage bucket is private; the path is what gets stored on the row. */
const BUCKET = 'project-files';

type Caller = { tenantId: string; email: string };

/**
 * Resolve the row AND decide whether this caller may write to it.
 *
 * Returns null when the caller may not — the caller never learns whether the id
 * was real, another tenant's, or global-and-out-of-reach, so both answers are
 * the same 404 at the call site.
 *
 * Catalog tables post-date the generated Database types, hence the `as any` db
 * idiom shared with /api/catalog.
 */
async function loadWritableItem(
  db: any,
  itemId: string,
  user: Caller,
): Promise<{ id: string; tenant_id: string | null } | null> {
  const { data, error } = await db
    .from('catalog_items')
    .select('id, tenant_id')
    .eq('id', itemId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as { id: string; tenant_id: string | null };
  if (row.tenant_id == null) return isPlatformAdmin(user.email) ? row : null;
  return row.tenant_id === user.tenantId ? row : null;
}

/** Write image_url on the row — tolerant of the column not existing yet.
 *
 *  The ownership predicate is repeated on the UPDATE itself rather than trusted
 *  from the read above: two statements, one row, and nothing in between may
 *  widen what gets written. */
async function setItemImage(
  db: any,
  item: { id: string; tenant_id: string | null },
  imageUrl: string | null,
): Promise<WriteFailure | null> {
  let q = db.from('catalog_items').update({ image_url: imageUrl }).eq('id', item.id);
  q = item.tenant_id == null ? q.is('tenant_id', null) : q.eq('tenant_id', item.tenant_id);
  const { error } = await q;
  if (error) {
    const msg = String(error.message || '');
    if (/image_url|column|schema/i.test(msg)) {
      return { status: 409, error: 'image_url column needed on catalog_items — migration pending, image not saved' };
    }
    return { status: 500, error: 'Could not save the image' };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const db = g.db as any;
  try {
    const ctype = req.headers.get('content-type') || '';

    // ── JSON mode: {itemId, imageUrl} — pasted manufacturer URL ──
    if (ctype.includes('application/json')) {
      const body = await req.json().catch(() => null);
      const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : '';
      const rawUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : '';
      if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
      const imageUrl = validHttpUrl(rawUrl);
      if (!imageUrl) return NextResponse.json({ error: 'imageUrl must be a valid http(s) URL' }, { status: 400 });
      const item = await loadWritableItem(db, itemId, g.user);
      if (!item) return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });
      const fail = await setItemImage(db, item, imageUrl);
      if (fail) return NextResponse.json({ error: fail.error }, { status: fail.status });
      return NextResponse.json({ ok: true, imageUrl });
    }

    // ── Multipart mode: {itemId, file} — real product photo upload ──
    const form = await req.formData();
    const itemId = String(form.get('itemId') || '').trim();
    const upload = form.get('file') as File | null;
    if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    if (!upload || typeof upload === 'string') return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    const mime = upload.type || '';
    if (!IMAGE_TYPES.has(mime)) return NextResponse.json({ error: 'Only PNG, JPEG, WebP, or GIF images are accepted' }, { status: 400 });
    if (upload.size > MAX_BYTES) return NextResponse.json({ error: 'Images must be 5MB or smaller' }, { status: 400 });
    const item = await loadWritableItem(db, itemId, g.user);
    if (!item) return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });

    /* Service role, like every other upload route here. The anon key that was
       here is the one shipped to browsers. */
    const storage = createServerClient();
    const buffer = Buffer.from(await upload.arrayBuffer());
    const storagePath = `catalog/${itemId}/${Date.now()}.${EXT_BY_TYPE[mime] || 'bin'}`;
    const { data: uploaded, error: uploadErr } = await storage.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mime });
    if (uploadErr || !uploaded) {
      console.error('[catalog/image] storage error:', uploadErr?.message);
      return apiError('catalog/image', uploadErr, 'Upload failed');
    }

    /* Store the PATH, not a public URL. The bucket is private, so getPublicUrl
       produced a link that answered 400 — /api/catalog signs this on read. */
    const fail = await setItemImage(db, item, storagePath);
    if (fail) return NextResponse.json({ error: fail.error }, { status: fail.status });

    /* Hand back a URL the page can render immediately, rather than a raw path
       the browser cannot fetch. */
    const { data: signed } = await storage.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
    return NextResponse.json({ ok: true, imageUrl: signed?.signedUrl || null, path: storagePath });
  } catch (e: unknown) {
    return apiError('catalog/image', e, 'Could not save the image');
  }
}

export async function PATCH(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const db = g.db as any;
  try {
    const body = await req.json().catch(() => null);
    const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : '';
    if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    let imageUrl: string | null = null;
    if (body?.imageUrl != null) {
      imageUrl = validHttpUrl(String(body.imageUrl).trim());
      if (!imageUrl) return NextResponse.json({ error: 'imageUrl must be a valid http(s) URL, or null to clear' }, { status: 400 });
    }
    const item = await loadWritableItem(db, itemId, g.user);
    if (!item) return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });
    const fail = await setItemImage(db, item, imageUrl);
    if (fail) return NextResponse.json({ error: fail.error }, { status: fail.status });
    return NextResponse.json({ ok: true, imageUrl });
  } catch (e: unknown) {
    return apiError('catalog/image', e, 'Could not update the image');
  }
}
