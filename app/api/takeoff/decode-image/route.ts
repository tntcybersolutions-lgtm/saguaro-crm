/**
 * Decode formats the browser can't render natively (HEIC/HEIF, TIFF/multi-page, some WEBP)
 * into a PNG the tracer can draw on. Server-side via sharp (already a dep). Auth-gated.
 * Body: { image: base64 | data-url }.  Returns { ok, dataUrl, width, height } | { ok:false, error }.
 */
import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: { image?: string; page?: number } | null;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid request body' }, { status: 200 }); }
  const raw = String(body?.image || '');
  if (!raw) return Response.json({ ok: false, error: 'Missing "image" (base64)' }, { status: 200 });

  const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  let buf: Buffer;
  try { buf = Buffer.from(b64, 'base64'); if (!buf.length) throw new Error('empty'); }
  catch { return Response.json({ ok: false, error: 'Could not decode base64 image' }, { status: 200 }); }
  if (buf.length > 60 * 1024 * 1024) return Response.json({ ok: false, error: 'Image too large (60MB max)' }, { status: 200 });

  const page = Number.isFinite(body?.page) && (body!.page as number) >= 0 ? Math.floor(body!.page as number) : 0;

  try {
    // honor EXIF orientation, select TIFF/HEIC page, cap the long edge for a responsive tracer.
    const png = await sharp(buf, { limitInputPixels: 1_000_000_000, page })
      .rotate()
      .resize({ width: 2600, height: 2600, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    return Response.json({ ok: true, dataUrl: 'data:image/png;base64,' + png.toString('base64'), width: meta.width ?? 0, height: meta.height ?? 0 });
  } catch (e) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[takeoff/decode-image]', e);
    const msg = "unknown";
    return Response.json({ ok: false, error: `Could not decode this image (${msg}). HEIC requires a HEIF-enabled build — if it fails, export the plan as PDF/PNG/JPG.` }, { status: 200 });
  }
}
