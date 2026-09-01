import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { ENTITY_MAP } from '@/lib/report-entities';

export const dynamic = 'force-dynamic';

// Tenant-scoped GET / PUT / DELETE for a single saved custom report (saved_reports).
function table(db: ReturnType<typeof createServerClient>) {
  return (db as unknown as { from: (t: string) => any }).from('saved_reports');
}

/** GET /api/reports/saved/[id] */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await table(db)
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ report: data });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

/** PUT /api/reports/saved/[id] — update name / entity / config. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
    if (typeof body.entity === 'string') {
      if (!ENTITY_MAP[body.entity]) return NextResponse.json({ error: 'Unknown entity' }, { status: 400 });
      update.entity = body.entity;
    }
    if (body.config && typeof body.config === 'object') update.config = body.config;

    const db = createServerClient();
    const { data, error } = await table(db)
      .update(update)
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ report: data });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[reports/saved/id]', e);
    const msg = "Failed to update report";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/reports/saved/[id] */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Reports', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { error } = await table(db)
      .delete()
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[reports/saved/id]', e);
    const msg = "Failed to delete report";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
