import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../supabase/admin';
import {
  createPayApplicationHandler,
  submitPayAppHandler,
  recordPaymentHandler,
} from '../../../../pay-app-workflow';

/** Extract tenant ID from Bearer token */
async function getTenantFromReq(req: NextRequest): Promise<string | null> {
  const bearer = req.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ')) return null;
  const token = bearer.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url === 'https://demo.supabase.co') return null;
  const { data: { user } } = await createClient(url, key).auth.getUser(token);
  return user?.id ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  // GET /api/pay-apps/list?projectId=...
  if (segment === 'list' || !segment) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    const tenantId = await getTenantFromReq(req);

    if (!tenantId) {
      const { DEMO_PAY_APPS } = await import('../../../../demo-data');
      return NextResponse.json({ payApps: DEMO_PAY_APPS, source: 'demo' });
    }

    try {
      let query = supabaseAdmin
        .from('pay_applications')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('application_number', { ascending: false });
      if (projectId) query = query.eq('project_id', projectId);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ payApps: data ?? [], source: 'live' });
    } catch {
      const { DEMO_PAY_APPS } = await import('../../../../demo-data');
      return NextResponse.json({ payApps: DEMO_PAY_APPS, source: 'demo' });
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

  // Inject real tenantId from auth token if body has 'demo'
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantFromToken = await getTenantFromReq(req);
  if (tenantFromToken && (!body.tenantId || body.tenantId === 'demo')) {
    body.tenantId = tenantFromToken;
  }
  const patchedReq = new NextRequest(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(body),
  });

  // POST /api/pay-apps/create
  if (segment === 'create') return createPayApplicationHandler(patchedReq);

  // POST /api/pay-apps/:payAppId/submit
  if (subAction === 'submit') return submitPayAppHandler(patchedReq, segment);

  // POST /api/pay-apps/:payAppId/record-payment
  if (subAction === 'record-payment') return recordPaymentHandler(patchedReq, segment);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
