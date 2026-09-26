import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

export const runtime = 'nodejs';
export const maxDuration = 120;

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALLOWED_TYPES = new Set([
  'wifi_ap',
  'camera',
  'motion_pir_ceiling',
  'smoke_detector_spot',
  'access_reader',
  'paging_speaker',
]);

const ALLOWED_MATERIALS = new Set(['drywall', 'glass', 'brick', 'concrete', 'metal']);

const SYSTEM = `You are a senior UniFi / low-voltage design engineer. You are shown a construction floor plan and must (1) read the building's geometry and (2) place network + security + life-safety devices on it. You read plans well: you identify the outer footprint, major walls, rooms, doorways, corridors, entrances, and open areas, and you place devices where a professional installer would.

Return ONLY raw JSON — no markdown, no backticks, no prose. Start with { end with }.

Device typeIds you may use (use these EXACT strings — any other typeId will be discarded):
- "wifi_ap"              WiFi access point — place for even coverage, ~1 per 1,800-2,500 sq ft, offset from walls, more in dense/enclosed areas.
- "camera"              CCTV camera — place in corners aimed across rooms, at every entrance/exit aimed at the door, and down corridors. Set "aimDeg" (0=east/right, 90=down, 180=left, 270=up) toward the area to watch.
- "motion_pir_ceiling"  Motion sensor — one per enclosed room needing intrusion detection.
- "smoke_detector_spot" Smoke detector — one per room / ~every 30 ft on-center in corridors (life safety).
- "access_reader"       Access control reader — at secured/exterior doors.
- "paging_speaker"      Paging/mass-notification speaker — spread across large/open areas.

Geometry you must also report:
- pxPerFt: If a scale bar, dimensioned line, or a clearly dimensioned room label is visible, estimate pixels-per-foot (a positive number). If nothing lets you establish scale, return null — do NOT guess.
- boundary: The building's outer wall outline as an ordered array of {x,y} image-pixel points tracing the footprint (at least 3 points). If the footprint is unclear, return [].
- walls: Major interior/exterior wall segments as {x1,y1,x2,y2,material}, material one of drywall|glass|brick|concrete|metal (best guess). If unclear, return [].

Coordinates are IMAGE PIXELS. Origin top-left. Keep every device inside the building footprint and off of wall lines.`;

function extractJson(raw: string): any {
  let c = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  try { return JSON.parse(c); } catch {}
  c = c.replace(/,\s*(?=[}\]])/g, '');
  try { return JSON.parse(c); } catch {}
  const s = c.indexOf('{'); if (s < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = s; i < c.length; i++) {
    const ch = c[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(c.slice(s, end + 1)); } catch { return null; }
}

function clamp(v: number, max: number): number {
  if (!Number.isFinite(v)) return NaN;
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}

/**
 * A failed scan answered HTTP 200.
 *
 * The shape is deliberate — callers destructure devices/walls/boundary and an
 * absent array would crash them — but the STATUS was not. 200 with empty
 * arrays is indistinguishable from "the plan was read and nothing was found",
 * so every layer above treated a dead AI call as a successful scan of an empty
 * building. The auto-scan path in Designer.tsx has no else branch at all: it
 * checked `res.ok && data.ok`, fell through, and drew nothing.
 *
 * Which is what "nobody knows how to use the heatmap" turned out to mean. The
 * Anthropic key backing the scan is out of credit, so the call fails in under
 * two seconds, and a user uploads a floor plan, presses scan, and watches
 * absolutely nothing happen — no devices, no walls, no error, no clue.
 *
 * 502 keeps the safe shape and stops it reading as success. `error` stays a
 * sentence written for the person holding the tablet, and the client shows it
 * rather than inventing a friendlier one that says less.
 */
function fail(error: string, status = 502) {
  return Response.json(
    { ok: false, error, devices: [], walls: [], boundary: [], pxPerFt: null },
    { status },
  );
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
  const { image, imgW, imgH, pxPerFt, goals } = body;
  if (!image || !imgW || !imgH) return Response.json({ error: 'Missing plan image or dimensions' }, { status: 400 });
  /* 503, not 502: nothing is wrong with the request, the feature is simply
     unavailable on this server. Worth distinguishing so support can tell a
     configuration problem from a bad plan file. */
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail('The AI scan is not configured on this server. Contact support — your plan was not lost.', 503);
  }

  const W = Number(imgW);
  const H = Number(imgH);

  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(image);
  const media = (m?.[1] || 'image/png') as any;
  const b64 = m?.[2] || image;

  const scaleLine = pxPerFt ? ` The scale is ${Number(pxPerFt).toFixed(3)} pixels per foot, so the plan is about ${Math.round(W / pxPerFt)} ft × ${Math.round(H / pxPerFt)} ft.` : '';
  const want = goals || 'WiFi coverage, security cameras, and basic life-safety/access';
  const prompt = `This floor plan image is ${W}px wide by ${H}px tall.${scaleLine}

First read the geometry (footprint, walls, scale), then design and place devices for: ${want}.

Return JSON exactly like:
{"devices":[{"typeId":"wifi_ap","x":420,"y":300,"label":"AP-Lobby","reason":"central open area"},{"typeId":"camera","x":90,"y":90,"aimDeg":45,"label":"CAM-Entry","reason":"covers main door"}],"walls":[{"x1":40,"y1":40,"x2":660,"y2":40,"material":"concrete"}],"boundary":[{"x":40,"y":40},{"x":660,"y":40},{"x":660,"y":460},{"x":40,"y":460}],"pxPerFt":12.5,"notes":["short design rationale line","..."]}

Rules: every coordinate x in 0..${W}, every y in 0..${H}. Cameras must include aimDeg. Provide 6-30 devices total appropriate to the plan size. boundary has >=3 points or is []. walls material is one of drywall|glass|brick|concrete|metal. pxPerFt is a positive number only if scale is legible, otherwise null. Keep it realistic and installable.`;

  let text: string;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: media, data: b64 } },
        { type: 'text', text: prompt },
      ] }],
    });
    text = (resp.content || []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('');
  } catch (err: any) {
    console.error('[heatmap/scan]', err);
    const status = err?.status;
    /* The billing case is its own answer. When the account behind the scan has
       no credit the API returns 400 with "credit balance is too low", and
       collapsing that into "could not read that plan" sent people off to
       re-export their drawings over and over for a problem no drawing could
       fix. That is exactly how this failure stayed invisible. */
    const upstream = String(err?.error?.error?.message ?? err?.message ?? '');
    const billing = /credit balance|insufficient|quota|billing/i.test(upstream);
    const msg = billing
      ? 'The AI scan is unavailable — the account behind it needs attention. Your plan is safe; place devices by hand or try again once it is sorted.'
      : status === 429
        ? 'The AI scan is busy right now — please try again in a moment.'
        : status === 401 || status === 403
          ? 'The AI scan is not configured correctly on this server. Contact support.'
          : 'The AI scan could not read that plan. Try a clearer or flattened image.';
    return fail(msg, billing || status === 401 || status === 403 ? 503 : 502);
  }

  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') {
    return fail('Could not parse the AI scan result');
  }

  const devices = (Array.isArray(parsed.devices) ? parsed.devices : [])
    .filter((d: any) => d && typeof d.x === 'number' && typeof d.y === 'number' && ALLOWED_TYPES.has(d.typeId))
    .map((d: any) => {
      const x = clamp(d.x, W);
      const y = clamp(d.y, H);
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      const out: any = { typeId: d.typeId, x, y };
      if (typeof d.label === 'string') out.label = d.label;
      if (typeof d.reason === 'string') out.reason = d.reason;
      if (d.typeId === 'camera') out.aimDeg = typeof d.aimDeg === 'number' && Number.isFinite(d.aimDeg) ? d.aimDeg : 0;
      return out;
    })
    .filter((d: any): d is any => d !== null);

  const walls = (Array.isArray(parsed.walls) ? parsed.walls : [])
    .map((w: any) => {
      if (!w || typeof w.x1 !== 'number' || typeof w.y1 !== 'number' || typeof w.x2 !== 'number' || typeof w.y2 !== 'number') return null;
      const x1 = clamp(w.x1, W), y1 = clamp(w.y1, H), x2 = clamp(w.x2, W), y2 = clamp(w.y2, H);
      if (Number.isNaN(x1) || Number.isNaN(y1) || Number.isNaN(x2) || Number.isNaN(y2)) return null;
      const material = typeof w.material === 'string' && ALLOWED_MATERIALS.has(w.material) ? w.material : 'drywall';
      return { x1, y1, x2, y2, material };
    })
    .filter((w: any): w is any => w !== null);

  const boundaryPts = (Array.isArray(parsed.boundary) ? parsed.boundary : [])
    .map((p: any) => {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
      const x = clamp(p.x, W), y = clamp(p.y, H);
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      return { x, y };
    })
    .filter((p: any): p is any => p !== null);
  const boundary = boundaryPts.length >= 3 ? boundaryPts : [];

  let outPxPerFt: number | null = null;
  if (typeof parsed.pxPerFt === 'number' && Number.isFinite(parsed.pxPerFt) && parsed.pxPerFt > 0) {
    outPxPerFt = parsed.pxPerFt;
  }

  const notes = Array.isArray(parsed.notes) ? parsed.notes.filter((n: any) => typeof n === 'string') : [];

  return Response.json({ ok: true, devices, walls, boundary, pxPerFt: outPxPerFt, notes });
}
