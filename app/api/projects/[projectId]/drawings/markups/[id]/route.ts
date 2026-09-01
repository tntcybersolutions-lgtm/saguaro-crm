/**
 * Canonical per-markup API — single markup (B1 markup contract).
 *   PATCH  — update data / color / page_number (stamps updated_by).
 *   DELETE — remove own markup (creator) or any markup (Documents Full).
 *   POST   — add a comment: drawing_markup_comments { markup_id, content, author_name }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission, hasPermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';

import { apiError } from '@/lib/api-error';
export const dynamic = 'force-dynamic';

type MarkupUpdate = Database['public']['Tables']['drawing_markups']['Update'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const supabase = createServerClient();

    const updates: MarkupUpdate = {
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };
    if (body.data !== undefined) updates.data = body.data;
    if (body.color !== undefined) updates.color = body.color;
    if (body.page_number !== undefined) {
      const p = Number(body.page_number);
      updates.page_number = Number.isFinite(p) && p >= 1 ? Math.floor(p) : null;
    }

    // Tenant-scope the write — service-role bypasses RLS; project_id from the
    // URL is attacker-controlled, so it alone does NOT prove tenant ownership.
    const { data, error } = await supabase
      .from('drawing_markups')
      .update(updates)
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) {
      console.error('[markups PATCH] update failed:', error.message);
      const notFound = error.code === 'PGRST116'; // zero rows matched
      return NextResponse.json(
        { error: notFound ? 'Markup not found' : error.message },
        { status: notFound ? 404 : 500 },
      );
    }
    return NextResponse.json({ markup: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[markups PATCH] failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const supabase = createServerClient();

    // Own-markup rule: the creator may delete their markup; anyone with
    // Documents Full (admin) may delete any markup in the tenant.
    const { data: existing, error: readErr } = await supabase
      .from('drawing_markups')
      .select('id, created_by')
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (readErr) {
      console.error('[markups DELETE] lookup failed:', readErr.message);
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: 'Markup not found' }, { status: 404 });

    // created_by is a uuid (auth user id) on both web and mobile writes.
    const isCreator = existing.created_by === user.id;
    if (!isCreator && !hasPermission(g.perms, 'Documents', 'Full')) {
      return NextResponse.json({ error: 'Only the creator or an admin can delete this markup' }, { status: 403 });
    }

    const { error } = await supabase
      .from('drawing_markups')
      .delete()
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId);

    if (error) {
      console.error('[markups DELETE] delete failed:', error.message);
      return apiError('projects/projectId/drawings/markups/id', error, undefined, 500);
    }
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[markups DELETE] failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST a comment on a markup — live columns are content / author_name. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    // Canonical field is `content`; tolerate older callers still sending `comment`.
    const content = String(body.content ?? body.comment ?? '').trim();
    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // drawing_markup_comments has no tenant column — prove tenant ownership
    // through the parent markup before inserting.
    const { data: markup, error: mErr } = await supabase
      .from('drawing_markups')
      .select('id')
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (mErr) {
      console.error('[markup comment POST] lookup failed:', mErr.message);
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }
    if (!markup) return NextResponse.json({ error: 'Markup not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('drawing_markup_comments')
      .insert({
        markup_id: id,
        content,
        author_name: typeof body.author_name === 'string' && body.author_name
          ? body.author_name
          : user.email || user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[markup comment POST] insert failed:', error.message);
      return apiError('projects/projectId/drawings/markups/id', error, undefined, 500);
    }
    return NextResponse.json({ comment: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[markup comment POST] failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
