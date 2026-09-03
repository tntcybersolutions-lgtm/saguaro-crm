/**
 * Canonical per-markup API (B1 markup contract).
 *
 * One row per markup in drawing_markups:
 *   markup_type: freehand|cloud|arrow|text|callout|rect|circle|measure|stamp|link
 *   data jsonb : { space:'image', w, h, geometry, style, ...kind extras }
 *                geometry is in IMAGE-PIXEL coordinates of the source page
 *                render; data.w/h record the reference image size.
 *   page_number: 1-based for multi-page PDFs, null for single images.
 *
 * LEGACY tolerance: older mobile rows are markup_type 'freehand' with data =
 * a raw stroke array in view pixels (no `space` field). Readers must render
 * those best-effort and never crash — this API returns them as-is.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';

import { apiError } from '@/lib/api-error';
export const dynamic = 'force-dynamic';

const MARKUP_TYPES = new Set([
  'freehand', 'cloud', 'arrow', 'text', 'callout', 'rect', 'circle', 'measure', 'stamp', 'link',
]);

type MarkupInsert = Database['public']['Tables']['drawing_markups']['Insert'];

type CommentRow = Database['public']['Tables']['drawing_markup_comments']['Row'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const drawingId = url.searchParams.get('drawing_id');
  const sheetId = url.searchParams.get('drawing_sheet_id');
  if (!drawingId && !sheetId) {
    return NextResponse.json({ error: 'drawing_id or drawing_sheet_id is required' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    let q = supabase
      .from('drawing_markups')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true });
    if (drawingId) q = q.eq('drawing_id', drawingId);
    if (sheetId) q = q.eq('drawing_sheet_id', sheetId);
    const { data, error } = await q;
    if (error) {
      console.error('[markups GET] query failed:', error.message);
      return apiError('projects/projectId/drawings/markups', error, undefined, 500);
    }

    // Comments (live columns: content / author_name) keyed by markup.
    const rows = data ?? [];
    const comments: Record<string, CommentRow[]> = {};
    if (rows.length > 0) {
      const { data: commentData, error: cErr } = await supabase
        .from('drawing_markup_comments')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .in('markup_id', rows.map((m) => m.id))
        .order('created_at', { ascending: true });
      if (cErr) {
        console.error('[markups GET] comments query failed:', cErr.message);
        return NextResponse.json({ error: cErr.message }, { status: 500 });
      }
      for (const c of commentData ?? []) {
        (comments[c.markup_id] ||= []).push(c);
      }
    }

    const markups = rows.map((m) => ({ ...m, comments: comments[m.id] || [] }));
    return NextResponse.json({ markups });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[markups GET] failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    if (!body.drawing_id && !body.drawing_sheet_id) {
      return NextResponse.json({ error: 'drawing_id or drawing_sheet_id is required' }, { status: 400 });
    }
    const markupType = String(body.markup_type || '');
    if (!MARKUP_TYPES.has(markupType)) {
      return NextResponse.json(
        { error: `markup_type must be one of: ${Array.from(MARKUP_TYPES).join(', ')}` },
        { status: 400 },
      );
    }
    if (body.data === undefined || body.data === null) {
      return NextResponse.json({ error: 'data is required' }, { status: 400 });
    }

    const pageNumber = Number(body.page_number);
    const row: MarkupInsert = {
      tenant_id: user.tenantId,
      project_id: projectId,
      drawing_id: body.drawing_id || null,
      drawing_sheet_id: body.drawing_sheet_id || null,
      page_number: Number.isFinite(pageNumber) && pageNumber >= 1 ? Math.floor(pageNumber) : null,
      markup_type: markupType,
      data: body.data,
      color: typeof body.color === 'string' && body.color ? body.color : '#EF4444',
      created_by: user.id, // live column is uuid — never write the email here
      created_by_name: typeof body.created_by_name === 'string' && body.created_by_name
        ? body.created_by_name
        : user.email,
      // 'link' markups carry the linked record; null for visual markups.
      entity_type: markupType === 'link' ? (body.entity_type || null) : null,
      entity_id: markupType === 'link' ? (body.entity_id || null) : null,
    };

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('drawing_markups')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('[markups POST] insert failed:', error.message);
      return apiError('projects/projectId/drawings/markups', error, undefined, 500);
    }
    return NextResponse.json({ markup: { ...data, comments: [] } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[markups POST] failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
