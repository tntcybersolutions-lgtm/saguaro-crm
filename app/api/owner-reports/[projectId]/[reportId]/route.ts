import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ projectId: string; reportId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { reportId } = await params;
  const db = createServerClient();

  try {
    const { data, error } = await db
      .from('owner_reports')
      .select('*')
      .eq('id', reportId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    return NextResponse.json({ report: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { reportId } = await params;
  const body = await req.json();
  const db = createServerClient();

  try {
    const allowed = [
      'executive_summary', 'schedule_status', 'schedule_narrative',
      'budget_status', 'budget_narrative', 'work_completed_narrative',
      'work_planned_narrative', 'issues_narrative', 'safety_narrative',
      'status',
    ];
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await db
      .from('owner_reports')
      .update(updates)
      .eq('id', reportId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    return NextResponse.json({ report: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { reportId } = await params;
  const body = await req.json();
  const db = createServerClient();

  if (body.action === 'distribute') {
    try {
      const { data: report } = await db
        .from('owner_reports')
        .select('*')
        .eq('id', reportId)
        .eq('tenant_id', user.tenantId)
        .single();

      if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

      // Mark as distributed
      await db.from('owner_reports').update({
        status: 'distributed',
        distributed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', reportId).eq('tenant_id', user.tenantId);

      return NextResponse.json({ success: true, distributed_at: new Date().toISOString() });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
