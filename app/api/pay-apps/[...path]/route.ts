import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import {
  createPayApplicationHandler,
  submitPayAppHandler,
  recordPaymentHandler,
} from '../../../../pay-app-workflow';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  // GET /api/pay-apps/list?projectId=... (fallback — dedicated list/route.ts takes priority)
  if (segment === 'list' || !segment) {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    try {
      const db = createServerClient();
      let query = db.from('pay_applications').select('*').eq('tenant_id', user.tenantId).order('app_number', { ascending: false });
      if (projectId) query = query.eq('project_id', projectId);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ payApps: data ?? [], source: 'live' });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment, subAction] = path;

  // POST /api/pay-apps/create
  if (segment === 'create') return createPayApplicationHandler(req);

  // POST /api/pay-apps/:payAppId/submit
  if (subAction === 'submit') return submitPayAppHandler(req, segment);

  // POST /api/pay-apps/:payAppId/record-payment
  if (subAction === 'record-payment') return recordPaymentHandler(req, segment);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
