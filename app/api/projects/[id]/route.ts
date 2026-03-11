import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { DEMO_PROJECT, DEMO_SUBS, DEMO_PAY_APPS, DEMO_CHANGE_ORDERS, DEMO_RFIS } from '../../../../demo-data';

function buildDemoResponse(id: string) {
  const p = { ...DEMO_PROJECT, id: id || DEMO_PROJECT.id, end_date: DEMO_PROJECT.substantial_date };
  const cos = DEMO_CHANGE_ORDERS;
  const apps = DEMO_PAY_APPS;
  const contractSumToDate = p.contract_amount + cos.reduce((s, co) => s + (co.cost_impact || 0), 0);
  const totalBilledToDate = apps.length > 0 ? apps[0].total_completed_and_stored : 0;
  return {
    project: { ...p, contractSumToDate, totalBilledToDate },
    subs: DEMO_SUBS,
    payApps: apps,
    changeOrders: cos,
    rfis: DEMO_RFIS,
    team: [],
    source: 'demo',
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = createServerClient();
    const [
      { data: project },
      { data: subs },
      { data: payApps },
      { data: changeOrders },
      { data: rfis },
      { data: team },
    ] = await Promise.all([
      db.from('projects').select('*').eq('id', id).single(),
      db.from('subcontractors').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      db.from('pay_applications').select('*').eq('project_id', id).order('app_number', { ascending: false }),
      db.from('change_orders').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      db.from('rfis').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      db.from('project_team').select('*').eq('project_id', id),
    ]);

    if (!project) {
      // Return demo data for demo project IDs
      return NextResponse.json(buildDemoResponse(id));
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
    // DB not available — return demo data
    return NextResponse.json(buildDemoResponse(id));
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const db = createServerClient();
    const { data, error } = await db.from('projects').update(body).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ project: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
