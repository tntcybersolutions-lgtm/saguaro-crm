import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePermission } from '@/lib/permissions';
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
 *  Catalog rows are a shared global reference dataset (tenant_id IS NULL), so
 *  there is no tenant scoping on the row itself — the Projects/Full permission
 *  gate is the protection. The image_url column is a PENDING migration on
 *  catalog_items (the orchestrator applies migrations): until it lands, writes
 *  return 409 'image_url column needed' instead of pretending to succeed.
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

/** Confirm the item exists. Catalog tables post-date the generated Database
 *  types, hence the `as any` db idiom shared with /api/catalog. */
async function findItem(db: any, itemId: string): Promise<boolean> {
  const { data, error } = await db.from('catalog_items').select('id').eq('id', itemId).maybeSingle();
  return !error && !!data;
}

/** Write image_url on the row — tolerant of the column not existing yet. */
async function setItemImage(db: any, itemId: string, imageUrl: string | null): Promise<WriteFailure | null> {
  const { error } = await db.from('catalog_items').update({ image_url: imageUrl }).eq('id', itemId);
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
      if (!(await findItem(db, itemId))) return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });
      const fail = await setItemImage(db, itemId, imageUrl);
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
    if (!(await findItem(db, itemId))) return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });

    const storage = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const buffer = Buffer.from(await upload.arrayBuffer());
    const storagePath = `catalog/${itemId}/${Date.now()}.${EXT_BY_TYPE[mime] || 'bin'}`;
    const { data: uploaded, error: uploadErr } = await storage.storage
      .from('project-files')
      .upload(storagePath, buffer, { contentType: mime });
    if (uploadErr || !uploaded) {
      console.error('[catalog/image] storage error:', uploadErr?.message);
      return apiError('catalog/image', uploadErr, 'Upload failed');
    }
    const { data: urlData } = storage.storage.from('project-files').getPublicUrl(storagePath);
    const imageUrl = urlData?.publicUrl || null;
    if (!imageUrl) return NextResponse.json({ error: 'Failed to resolve public URL' }, { status: 500 });

    const fail = await setItemImage(db, itemId, imageUrl);
    if (fail) return NextResponse.json({ error: fail.error }, { status: fail.status });
    return NextResponse.json({ ok: true, imageUrl });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    if (!(await findItem(db, itemId))) return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 });
    const fail = await setItemImage(db, itemId, imageUrl);
    if (fail) return NextResponse.json({ error: fail.error }, { status: fail.status });
    return NextResponse.json({ ok: true, imageUrl });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
