import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { UnsupportedImageError } from '@/lib/image-thumb';
import { storePhoto, PhotoStoreError } from '@/lib/photo-store';
import { apiError } from '@/lib/api-error';
import { signFields } from '@/lib/storage-signing';

// sharp is a native module and a 12MP re-encode takes ~1-2s, so this handler is
// pinned to the Node runtime with headroom rather than the default edge limits.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const formData = await req.formData();
    const upload = (formData.get('file') ?? formData.get('image') ?? formData.get('photo')) as File | null;
    const projectId = (formData.get('projectId') as string) || '';
    const category  = (formData.get('category')  as string) || 'Progress';
    const caption   = (formData.get('caption')   as string) || '';
    const rawFilename = upload?.name || `photo-${Date.now()}.jpg`;

    // Optional GPS, posted as a 'lat,lng' string.
    let locationLat: number | null = null;
    let locationLng: number | null = null;
    const location = (formData.get('location') as string) || '';
    if (location) {
      const [latStr, lngStr] = location.split(',');
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        locationLat = lat;
        locationLng = lng;
      }
    }

    if (!upload) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Service-role client for BOTH storage and DB — bypasses RLS (the old code used the
    // anon client for the insert, which RLS rejected -> 500 -> photo silently lost).
    const db = createServerClient();
    const original = Buffer.from(await upload.arrayBuffer());

    // Shrink + thumbnail + photos row — shared with /api/photos/ingest (the
    // direct-to-storage path for photos too big to send through here).
    let stored;
    try {
      stored = await storePhoto(db, {
        tenantId: user.tenantId,
        projectId,
        original,
        fileName: rawFilename,
        contentType: upload.type,
        category,
        caption,
        takenBy: user.email || '',
        location: locationLat != null && locationLng != null ? { lat: locationLat, lng: locationLng } : null,
      });
    } catch (e: unknown) {
      if (e instanceof UnsupportedImageError) {
        // A HEIC we have no codec for. Storing it would put an object in the
        // bucket that no browser and no Android device can display — refuse
        // loudly instead of reporting a success that isn't one. The message is
        // ours, not the database's, so it is safe to show.
        return apiError('photos/upload', e, e.message, 415);
      }
      if (e instanceof PhotoStoreError) return apiError('photos/upload', e.detail ?? e, e.message, e.status);
      throw e;
    }

    // The row stores url/thumbnail_url in PUBLIC-url form; the bucket is private,
    // so those 400 on load. photos/list signs them on read — but the upload
    // response feeds the client's OPTIMISTIC preview, which rendered the dead
    // public URL and showed a broken tile until a reload re-signed via the list
    // (MUST-PASS Path 3 detour). Sign the RESPONSE copy here with the same
    // signFields the list uses, so the preview is live immediately. Non-strict:
    // the photo is already saved, so a transient signing hiccup must not turn a
    // successful upload into a 500 — the next list re-signs regardless.
    const [signedPhoto] = await signFields([stored.photo], ['url', 'thumbnail_url'], 3600, { strict: false });

    return NextResponse.json({
      success: true,
      photo: signedPhoto ?? stored.photo,
      ...(stored.warning ? { warning: stored.warning } : {}),
    });
  } catch (err: unknown) {
    return apiError('photos/upload', err, 'Internal server error');
  }
}
