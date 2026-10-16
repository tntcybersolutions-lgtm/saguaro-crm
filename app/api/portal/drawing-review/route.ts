import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signUrl } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Public drawing-review portal API (B4 contract + Wave-2 guest markups).
 *
 * GET ?token= -> {
 *   drawing: { id, label, fileUrl, fileType, pages? },
 *   markups: [drawing_markups rows, 'link' rows excluded],
 *   generatedAt,
 *   // extras the portal page renders (additive to the contract):
 *   projectName, linkLabel, sheetId, drawingId
 * }
 *
 * POST ?token=  body { guestName, markups: [{ markup_type, data, page_number? }] }
 *   -> { ok, saved: [rows] }
 * Guests may only create freehand | cloud | arrow | rect | text (max 10 per
 * request, geometry size-capped). Rows insert with tenant/project/drawing
 * pinned to the LINK row (never the body), created_by null, created_by_name =
 * 'Guest · <sanitized name>' (fallback: the link's label). page_number is only
 * stored when the link's file is a PDF.
 *
 * Wave-3: guests can edit/remove their OWN markups. The link is the trust
 * boundary — anyone holding the token is a trusted reviewer — but only
 * guest-authored rows (created_by IS NULL) on exactly this link's
 * drawing/sheet + tenant are ever touchable. Staff rows are untouchable.
 *
 * DELETE ?token=&id=            -> { ok } (hard 403 unless guest-owned + in scope)
 * PATCH  ?token=  body {id,text} -> { ok, row } — text-only edit for 'text'
 *   markups (sanitized, <=500 printable chars); 400 for non-text rows.
 *
 * 401 on invalid / expired / revoked tokens. Service-role client; every query
 * is pinned to the link row's tenant + drawing so nothing else can leak.
 */

function isPdf(url: string, fileType?: string | null): boolean {
  if (fileType && /pdf/i.test(fileType)) return true;
  return /\.pdf(\?|$)/i.test(url || '');
}

/** Link row iff the token exists, is unrevoked, and is unexpired. */
async function getActiveLink(db: any, token: string): Promise<any | null> {
  const { data: link } = await db
    .from('drawing_review_links')
    .select('*')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle();
  if (!link) return null;
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return null;
  return link;
}

/**
 * Resolve the link's file: sheet-scoped links render the sheet's file,
 * otherwise the drawing's. Both lookups stay pinned to the link's tenant.
 * Returns null when the target row is missing (treated like a dead link).
 */
async function resolveLinkFile(db: any, link: any): Promise<{ id: string; label: string; rawUrl: string; fileType: string } | null> {
  if (link.drawing_sheet_id) {
    const { data: sheet } = await db
      .from('drawing_sheets')
      .select('id, sheet_number, sheet_title, file_url, file_type')
      .eq('id', link.drawing_sheet_id)
      .eq('tenant_id', link.tenant_id)
      .maybeSingle();
    if (!sheet) return null;
    return {
      id: sheet.id,
      label: [sheet.sheet_number, sheet.sheet_title].filter(Boolean).join(' — ') || 'Sheet',
      rawUrl: sheet.file_url || '',
      fileType: isPdf(sheet.file_url || '', sheet.file_type) ? 'application/pdf' : 'image',
    };
  }
  if (link.drawing_id) {
    const { data: drawing } = await db
      .from('drawings')
      .select('id, name, sheet_number, url')
      .eq('id', link.drawing_id)
      .eq('tenant_id', link.tenant_id)
      .maybeSingle();
    if (!drawing) return null;
    return {
      id: drawing.id,
      label: [drawing.sheet_number, drawing.name].filter(Boolean).join(' — ') || 'Drawing',
      rawUrl: drawing.url || '',
      fileType: isPdf(drawing.url || '') ? 'application/pdf' : 'image',
    };
  }
  return null;
}

const DEAD_LINK = () => NextResponse.json({ error: 'Link expired or revoked' }, { status: 401 });

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  try {
    const db = createServerClient() as any;
    const link = await getActiveLink(db, token);
    if (!link) return DEAD_LINK();
    const file = await resolveLinkFile(db, link);
    if (!file) return DEAD_LINK();
    if (!file.rawUrl) return NextResponse.json({ error: 'This drawing has no file attached' }, { status: 404 });

    // Markups for exactly this drawing/sheet, tenant-pinned. 'link' rows are
    // internal cross-references — never shown to outside reviewers.
    let mq = db
      .from('drawing_markups')
      .select('*')
      .eq('tenant_id', link.tenant_id)
      .neq('markup_type', 'link')
      .order('created_at', { ascending: true })
      .limit(2000);
    mq = link.drawing_sheet_id
      ? mq.eq('drawing_sheet_id', link.drawing_sheet_id)
      : mq.eq('drawing_id', link.drawing_id);
    const { data: markups, error: mErr } = await mq;
    if (mErr) throw mErr;

    // Project label for the brand-neutral header.
    let projectName = '';
    if (link.project_id) {
      const { data: proj } = await db
        .from('projects')
        .select('name')
        .eq('id', link.project_id)
        .maybeSingle();
      projectName = proj?.name || '';
    }

    return NextResponse.json({
      drawing: {
        id: file.id,
        label: file.label,
        fileUrl: await signUrl(file.rawUrl, 3600),
        fileType: file.fileType,
        // pages is intentionally absent: page count is only knowable once
        // pdf.js opens the file — the portal page reports it client-side.
      },
      markups: markups || [],
      generatedAt: new Date().toISOString(),
      projectName,
      linkLabel: link.label || '',
      drawingId: link.drawing_id || null,
      sheetId: link.drawing_sheet_id || null,
    });
  } catch (e: unknown) {
    return apiError('portal/drawing-review GET', e);
  }
}

/* ── Wave-2: guest markup creation ─────────────────────────────────────── */

const GUEST_MARKUP_TYPES = new Set(['freehand', 'cloud', 'arrow', 'rect', 'text']);
const MAX_GUEST_MARKUPS = 10;
const MAX_COORD = 100000; // image-pixel sanity cap (plan rasters top out ~4k)
const MAX_FREEHAND_POINTS = 4000;
const MAX_TEXT_CHARS = 500;

/** Finite number within sane image-pixel magnitude, else null. */
function coord(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= MAX_COORD ? Math.round(n * 100) / 100 : null;
}

/** Strip control chars (keep \n and \t), collapse runs of spaces. */
function printable(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/ {2,}/g, ' ');
}

/**
 * Whitelist-rebuild the geometry for a guest markup kind. Returns null when
 * the shape is malformed or oversized — the caller 400s the whole request.
 */
function sanitizeGeometry(kind: string, raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const g = raw as Record<string, unknown>;
  switch (kind) {
    case 'freehand': {
      if (!Array.isArray(g.points) || g.points.length < 2 || g.points.length > MAX_FREEHAND_POINTS) return null;
      const pts: { x: number; y: number }[] = [];
      for (const p of g.points) {
        if (!p || typeof p !== 'object') return null;
        const x = coord((p as any).x), y = coord((p as any).y);
        if (x === null || y === null) return null;
        pts.push({ x, y });
      }
      return { points: pts };
    }
    case 'rect':
    case 'cloud': {
      const x = coord(g.x), y = coord(g.y), w = coord(g.w), h = coord(g.h);
      if (x === null || y === null || w === null || h === null) return null;
      return { x, y, w, h };
    }
    case 'arrow': {
      const x1 = coord(g.x1), y1 = coord(g.y1), x2 = coord(g.x2), y2 = coord(g.y2);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      return { x1, y1, x2, y2 };
    }
    case 'text': {
      const x = coord(g.x), y = coord(g.y);
      if (x === null || y === null) return null;
      return { x, y };
    }
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  try {
    const db = createServerClient() as any;
    const link = await getActiveLink(db, token);
    if (!link) return DEAD_LINK();
    const file = await resolveLinkFile(db, link);
    if (!file) return DEAD_LINK();
    const linkIsPdf = file.fileType === 'application/pdf';

    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // Guest identity: sanitized display name, never an auth identity.
    const rawName = typeof (body as any).guestName === 'string' ? (body as any).guestName : '';
    const cleanName = printable(rawName).replace(/\s+/g, ' ').trim().slice(0, 40);
    const fallback = printable(String(link.label || '')).replace(/\s+/g, ' ').trim().slice(0, 40) || 'Reviewer';
    const createdByName = `Guest · ${cleanName || fallback}`;

    const list = Array.isArray((body as any).markups) ? (body as any).markups : [];
    if (!list.length) return NextResponse.json({ error: 'markups is required' }, { status: 400 });
    if (list.length > MAX_GUEST_MARKUPS) {
      return NextResponse.json({ error: `Too many markups — max ${MAX_GUEST_MARKUPS} per request` }, { status: 400 });
    }

    const rows: Record<string, unknown>[] = [];
    for (const m of list) {
      if (!m || typeof m !== 'object') {
        return NextResponse.json({ error: 'Each markup must be an object' }, { status: 400 });
      }
      const kind = String((m as any).markup_type || '');
      if (!GUEST_MARKUP_TYPES.has(kind)) {
        return NextResponse.json(
          { error: `Guests can only add: ${Array.from(GUEST_MARKUP_TYPES).join(', ')}` },
          { status: 400 },
        );
      }
      const d = (m as any).data;
      if (!d || typeof d !== 'object' || Array.isArray(d)) {
        return NextResponse.json({ error: 'markup data must be an object' }, { status: 400 });
      }
      const o = d as Record<string, unknown>;
      if (o.space !== 'image') {
        return NextResponse.json({ error: "markup data.space must be 'image'" }, { status: 400 });
      }
      const w = Number(o.w), h = Number(o.h);
      if (!(Number.isFinite(w) && w > 0 && w <= MAX_COORD) || !(Number.isFinite(h) && h > 0 && h <= MAX_COORD)) {
        return NextResponse.json({ error: 'markup data.w/h must be positive reference-render pixels' }, { status: 400 });
      }
      const geometry = sanitizeGeometry(kind, o.geometry);
      if (!geometry) {
        return NextResponse.json({ error: `Invalid ${kind} geometry` }, { status: 400 });
      }

      const styleIn = (o.style && typeof o.style === 'object' ? o.style : {}) as Record<string, unknown>;
      const color = typeof styleIn.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(styleIn.color)
        ? styleIn.color
        : '#FF8A00';
      const widthN = Number(styleIn.width);
      const style = { color, width: Number.isFinite(widthN) && widthN > 0 ? Math.min(30, widthN) : 3 };

      const data: Record<string, unknown> = { space: 'image', w: Math.round(w), h: Math.round(h), geometry, style };
      if (kind === 'text') {
        const text = typeof o.text === 'string' ? printable(o.text).trim().slice(0, MAX_TEXT_CHARS) : '';
        if (!text) return NextResponse.json({ error: 'text markups need text' }, { status: 400 });
        data.text = text;
        const fs = Number(o.fontSize);
        if (Number.isFinite(fs) && fs > 0) data.fontSize = Math.min(200, Math.max(8, Math.round(fs)));
      }

      // page_number is only meaningful (and only stored) for PDF links.
      const pn = Number((m as any).page_number);
      rows.push({
        tenant_id: link.tenant_id,
        project_id: link.project_id || null,
        drawing_id: link.drawing_id || null,
        drawing_sheet_id: link.drawing_sheet_id || null,
        page_number: linkIsPdf && Number.isFinite(pn) && pn >= 1 ? Math.floor(pn) : null,
        markup_type: kind,
        data,
        color,
        created_by: null, // guests have no auth identity
        created_by_name: createdByName,
      });
    }

    const { data: saved, error } = await db.from('drawing_markups').insert(rows).select();
    if (error) throw error;
    return NextResponse.json({ ok: true, saved: saved || [] });
  } catch (e: unknown) {
    return apiError('portal/drawing-review POST', e);
  }
}

/* ── Wave-3: guest own-markup edit / delete ────────────────────────────── */

/**
 * Load one markup row and verify this LINK may touch it. Body/query ids are
 * never trusted for scoping — the row is loaded fresh and re-checked against
 * the link row: guest-authored (created_by IS NULL), same tenant, and on
 * exactly the drawing/sheet this link exposes. 'link' rows are internal
 * cross-references guests never see, so they are never touchable either.
 * Returns the row, or null (callers hard-403 — no existence oracle).
 */
async function loadGuestOwnedRow(db: any, link: any, id: string): Promise<any | null> {
  if (!id || typeof id !== 'string') return null;
  const { data: row } = await db
    .from('drawing_markups')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', link.tenant_id)
    .maybeSingle();
  if (!row) return null;
  if (row.created_by !== null && row.created_by !== undefined) return null; // staff rows: untouchable
  if (row.markup_type === 'link') return null;
  if (link.drawing_sheet_id) {
    if (row.drawing_sheet_id !== link.drawing_sheet_id) return null;
  } else if (!link.drawing_id || row.drawing_id !== link.drawing_id) {
    return null;
  }
  return row;
}

const NOT_YOURS = () =>
  NextResponse.json({ error: 'You can only change markups you created from this link' }, { status: 403 });

export async function DELETE(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const id = req.nextUrl.searchParams.get('id');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const db = createServerClient() as any;
    const link = await getActiveLink(db, token);
    if (!link) return DEAD_LINK();
    const row = await loadGuestOwnedRow(db, link, id);
    if (!row) return NOT_YOURS();
    const { error } = await db
      .from('drawing_markups')
      .delete()
      .eq('id', row.id)
      .eq('tenant_id', link.tenant_id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return apiError('portal/drawing-review DELETE', e);
  }
}

export async function PATCH(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  try {
    const db = createServerClient() as any;
    const link = await getActiveLink(db, token);
    if (!link) return DEAD_LINK();

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const id = typeof (body as any).id === 'string' ? (body as any).id : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const row = await loadGuestOwnedRow(db, link, id);
    if (!row) return NOT_YOURS();
    if (row.markup_type !== 'text') {
      return NextResponse.json({ error: 'Only text markups can be edited' }, { status: 400 });
    }

    const rawText = typeof (body as any).text === 'string' ? (body as any).text : '';
    const text = printable(rawText).trim().slice(0, MAX_TEXT_CHARS);
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });

    const data =
      row.data && typeof row.data === 'object' && !Array.isArray(row.data)
        ? { ...(row.data as Record<string, unknown>), text }
        : { text };
    const { data: updated, error } = await db
      .from('drawing_markups')
      .update({ data, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('tenant_id', link.tenant_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, row: updated || null });
  } catch (e: unknown) {
    return apiError('portal/drawing-review PATCH', e);
  }
}
