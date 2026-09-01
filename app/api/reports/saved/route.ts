import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { ENTITY_MAP } from '@/lib/report-entities';

export const dynamic = 'force-dynamic';

// saved_reports: id, tenant_id, created_by, name, entity, config (jsonb), created_at, updated_at
// NOTE: this is a distinct feature from the pre-canned report_templates served by
// /api/reports and /api/reports/[id]. Custom builder reports live in saved_reports.

// The saved_reports table is not present in the (stale) generated Database types, so
// the client is accessed through a permissive handle. All writes remain tenant-scoped.
function table(db: ReturnType<typeof createServerClient>) {
  return (db as unknown as { from: (t: string) => any }).from('saved_reports');
}

/** GET /api/reports/saved — list the tenant's saved custom reports. */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await table(db)
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ reports: data ?? [] });
  } catch {
    return NextResponse.json({ reports: [] });
  }
}

/** POST /api/reports/saved — create a saved custom report. */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const entity = typeof body.entity === 'string' ? body.entity : '';
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!ENTITY_MAP[entity]) return NextResponse.json({ error: 'Unknown entity' }, { status: 400 });

    const config = (body.config && typeof body.config === 'object') ? body.config : {};

    const db = createServerClient();
    const { data, error } = await table(db)
      .insert({
        tenant_id: user.tenantId,
        created_by: user.id,
        name,
        entity,
        config,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ report: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[reports/saved]', e);
    const msg = "Failed to save report";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
