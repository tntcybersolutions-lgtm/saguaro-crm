import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

const ALLOWED = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
const MAX_BYTES = 5 * 1024 * 1024;

/** POST /api/branding/logo — multipart upload of the tenant logo to the public
 *  `branding` bucket (tenant-prefixed), persists the URL to tenants.settings. */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Logo must be under 5 MB' }, { status: 400 });

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!ALLOWED.includes(ext)) return NextResponse.json({ error: 'Use PNG, JPG, WEBP, or SVG' }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const db = createServerClient();
  const path = `${user.tenantId}/logo_${Date.now()}.${ext}`;

  const { error: upErr } = await db.storage
    .from('branding')
    .upload(path, bytes, { contentType: file.type || `image/${ext}`, upsert: true });
  if (upErr) return apiError('branding/logo', upErr);

  // Public bucket → permanent URL (logos are public by nature; they go on PDFs,
  // portals, and emails sent to owners/subs).
  const { data: pub } = db.storage.from('branding').getPublicUrl(path);
  const logo_url = pub.publicUrl;

  /* ── WHICH WAY ROUND IS THIS LOGO? ──────────────────────────────────────
   * The app chrome is near-black. A GC who uploads a dark logo — dark text on
   * transparent, or a dark badge — gets a tile that looks empty, which is
   * exactly the "you can't see it" complaint. A GC who uploads a white
   * knock-out logo needs the opposite. We cannot guess from the filename, so
   * measure it once, here, and let the sidebar render accordingly.
   *
   * Mean luminance is taken over VISIBLE pixels only. Averaging the
   * transparent ones would drag every transparent PNG toward black and put a
   * light plate behind logos that never needed one. */
  let logo_tone: 'dark' | 'light' | 'unknown' = 'unknown';
  /* Dimensions matter as much as tone. The sidebar constrains a logo by HEIGHT,
   * so a tall portrait image collapses to a sliver — a real 600x1301 logo in
   * this tenant rendered at 22x48px, which is the "you can't see it" report.
   * Storing the shape lets the sidebar size it sensibly AND lets Settings warn
   * the user at upload instead of silently producing a sliver. */
  let logo_w: number | null = null;
  let logo_h: number | null = null;
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(bytes, { failOn: 'none' }).metadata();
    logo_w = typeof meta.width === 'number' ? meta.width : null;
    logo_h = typeof meta.height === 'number' ? meta.height : null;
    const { data, info } = await sharp(bytes, { failOn: 'none' })
      .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let lum = 0;
    let seen = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const a = data[i + 3];
      if (a < 32) continue; // effectively transparent — ignore
      // Rec. 709 luma, good enough to answer "light or dark?"
      lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      seen++;
    }
    if (seen > 0) logo_tone = lum / seen < 110 ? 'dark' : 'light';
  } catch {
    // SVGs without a rasteriser, or anything sharp will not open: leave
    // 'unknown' and the sidebar falls back to its neutral treatment.
  }

  // Merge into tenants.settings so the WhiteLabelProvider + reports pick it up.
  const { data: existing } = await db.from('tenants').select('settings').eq('id', user.tenantId).single();
  const settings = { ...((existing as any)?.settings ?? {}), logo_url, logo_tone, logo_w, logo_h };
  const { error: updErr } = await db
    .from('tenants')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('id', user.tenantId);
  if (updErr) return apiError('branding/logo', updErr);

  return NextResponse.json({ ok: true, logo_url, logo_tone, logo_w, logo_h });
}
