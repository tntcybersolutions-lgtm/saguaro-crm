import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import crypto from 'crypto';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Drawing review links — staff side (B4 contract).
 *
 * POST   { drawingId, sheetId?, label?, expiresDays? } -> { ok, url, token }
 *        Mints a read-only, token-gated share link for one drawing
 *        (optionally scoped to one drawing_sheets row). Default expiry 30 days.
 * GET    ?drawingId=  -> { links } active (unrevoked) links for the drawing.
 * DELETE ?id=         -> { ok } revoke (sets revoked_at).
 *
 * All three are tenant-scoped behind requirePermission('Projects','View') like
 * the sibling drawing routes. The public consumer is
 * GET /api/portal/drawing-review?token= (service-role, no auth).
 */

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const db = createServerClient() as any;
    const b = await req.json().catch(() => ({}));
    const drawingId = String(b.drawingId || '').trim();
    if (!drawingId) return NextResponse.json({ error: 'drawingId required' }, { status: 400 });

    const { data: drawing } = await db
      .from('drawings')
      .select('id, project_id, tenant_id')
      .eq('id', drawingId)
      .eq('tenant_id', g.user.tenantId)
      .maybeSingle();
    if (!drawing) return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });

    // Optional sheet scope — must be a real sheet in the same tenant.
    let sheetId: string | null = null;
    let projectId: string | null = drawing.project_id || null;
    if (b.sheetId) {
      const { data: sheet } = await db
        .from('drawing_sheets')
        .select('id, project_id')
        .eq('id', String(b.sheetId))
        .eq('tenant_id', g.user.tenantId)
        .maybeSingle();
      if (!sheet) return NextResponse.json({ error: 'Sheet not found' }, { status: 404 });
      sheetId = sheet.id;
      projectId = projectId || sheet.project_id || null;
    }
    if (!projectId) {
      // drawings.project_id is nullable in the live schema; a link row requires
      // a project. Honest error instead of inventing one.
      return NextResponse.json({ error: 'This drawing is not attached to a project' }, { status: 400 });
    }

    const token = 'dr_' + crypto.randomBytes(24).toString('hex'); // 51 chars, crypto-random
    const expiresDays = Math.max(1, Math.min(365, Number(b.expiresDays) || 30));
    const expires_at = new Date(Date.now() + expiresDays * 86400000).toISOString();

    const { data: link, error } = await db
      .from('drawing_review_links')
      .insert({
        tenant_id: g.user.tenantId,
        project_id: projectId,
        drawing_id: drawingId,
        drawing_sheet_id: sheetId,
        token,
        label: String(b.label || '').trim() || null,
        created_by: g.user.id,
        expires_at,
      } as never)
      .select()
      .single();
    if (error) throw error;

    const origin = new URL(req.url).origin;
    return NextResponse.json(
      { ok: true, url: `${origin}/portals/drawing-review/${token}`, token, link },
      { status: 201 },
    );
  } catch (e: unknown) {
    return apiError('drawings/review-link POST', e);
  }
}

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const drawingId = req.nextUrl.searchParams.get('drawingId');
    if (!drawingId) return NextResponse.json({ error: 'drawingId required' }, { status: 400 });
    const db = createServerClient() as any;
    const { data, error } = await db
      .from('drawing_review_links')
      .select('id, token, label, drawing_id, drawing_sheet_id, expires_at, created_at')
      .eq('tenant_id', g.user.tenantId)
      .eq('drawing_id', drawingId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const origin = new URL(req.url).origin;
    const links = ((data || []) as any[]).map((l) => ({
      ...l,
      url: `${origin}/portals/drawing-review/${l.token}`,
      expired: !!(l.expires_at && new Date(l.expires_at).getTime() < Date.now()),
    }));
    return NextResponse.json({ links });
  } catch (e: unknown) {
    return apiError('drawings/review-link GET', e);
  }
}

export async function DELETE(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const db = createServerClient() as any;
    const { error } = await db
      .from('drawing_review_links')
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('tenant_id', g.user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return apiError('drawings/review-link DELETE', e);
  }
}
