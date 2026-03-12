import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const [
      { data: project },
      { data: subs },
      { data: payApps },
      { data: changeOrders },
      { data: rfis },
      { data: team },
    ] = await Promise.all([
      db.from('projects').select('*').eq('id', projectId).eq('tenant_id', user.tenantId).single(),
      db.from('subcontractors').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('pay_applications').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('app_number', { ascending: false }),
      db.from('change_orders').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('rfis').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('project_team').select('*').eq('project_id', projectId),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const cos = (changeOrders || []) as any[];
    const apps = (payApps || []) as any[];
    const p = project as any;
    const contractSumToDate = (p.contract_amount || 0) + cos.reduce((s: number, co: any) => s + (co.cost_impact || 0), 0);
    const totalBilledToDate = apps.length > 0 ? (apps[0].prev_completed || 0) + (apps[0].this_period || 0) : 0;

    return NextResponse.json({
      project: { ...p, contractSumToDate, totalBilledToDate },
      subs: subs || [],
      payApps: apps,
      changeOrders: cos,
      rfis: rfis || [],
      team: team || [],
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const db = createServerClient();
    const { data, error } = await db.from('projects').update(body).eq('id', projectId).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ project: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
