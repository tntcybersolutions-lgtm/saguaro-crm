import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    const { data, error } = await db
      .from('owner_reports')
      .select('id, report_number, period_from, period_to, report_date, status, executive_summary, metrics, sage_generated, distributed_at')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('report_number', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ reports: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();
  const db = createServerClient();

  try {
    const { data, error } = await db
      .from('owner_reports')
      .insert({
        project_id: projectId,
        tenant_id: user.tenantId,
        period_from: body.period_from,
        period_to: body.period_to,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ report: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
