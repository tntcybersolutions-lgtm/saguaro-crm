import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// GET /api/safety/talks?projectId=  -> { talks: [...] }  (toolbox talks)
export async function GET(req: NextRequest) {
  // Role check, not just sign-in: Safety: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Safety', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');
  try {
    const db = createServerClient();
    // Embed the presenter's profile via the created_by FK so we can resolve a
    // human-readable name instead of leaking the raw user UUID.
    let q = db
      .from('toolbox_talks')
      .select('*, presenter_profile:profiles!toolbox_talks_created_by_fkey(full_name)')
      .eq('tenant_id', user.tenantId)
      .order('talk_date', { ascending: false });
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) throw error;
    // Map to the shape the mobile app expects (conducted_by <- presenter name).
    // Prefer the plain-text presenter, then the resolved profile name, then the
    // raw value so a UUID never surfaces in the UI.
    const talks = (data || []).map((t: Record<string, any>) => {
      const { presenter_profile, ...rest } = t;
      const resolvedName = presenter_profile?.full_name ?? null;
      return {
        ...rest,
        conducted_by: t.presenter || resolvedName || t.conducted_by || t.created_by || '',
        notes: t.notes ?? t.content ?? '',
      };
    });
    return NextResponse.json({ talks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety/talks', e);
  }
}

// POST /api/safety/talks  -> log a toolbox talk
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({} as Record<string, any>));
    /* Was a 500 on a missing field — the database's rejection surfacing as an
       "Internal server error", which tells a user nothing and tells support
       nothing either. 400 naming the field, like the nineteen other create
       endpoints in this codebase. */
    if (!(body.project_id || body.projectId) || !String(body.topic || '').trim()) {
      return NextResponse.json({ error: 'project_id and topic are required is required' }, { status: 400 });
    }
    const db = createServerClient();
    const row: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: body.project_id,
      topic: body.topic || '',
      presenter: body.conducted_by || body.presenter || '',
      attendee_count: body.attendee_count ?? 0,
      talk_date: body.talk_date || new Date().toISOString(),
      content: body.notes || body.content || '',
    };
    const { data, error } = await db.from('toolbox_talks').insert(row as Database['public']['Tables']['toolbox_talks']['Insert']).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, talk: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety/talks', e);
  }
}
