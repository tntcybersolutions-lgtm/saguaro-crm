import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { createPayApplicationHandler } from '../../../../pay-app-workflow';
import { apiError } from '@/lib/api-error';
import { transitionPayAppStatus } from '@/lib/pay-app-status';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  // GET /api/pay-apps/list?projectId=... (fallback — dedicated list/route.ts takes priority)
  if (segment === 'list' || !segment) {
    const g = await requirePermission(req, 'Pay Apps', 'View');
    if (!g.ok) return g.res;
    const user = g.user;
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    try {
      const db = createServerClient();
      let query = db.from('pay_applications').select('*').eq('tenant_id', user.tenantId).order('app_number', { ascending: false });
      if (projectId) query = query.eq('project_id', projectId);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ payApps: data ?? [], source: 'live' });
    } catch (e) {
      return apiError('pay-apps/[...path] GET', e);
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

  /* POST /api/pay-apps/:payAppId/submit and /record-payment. Both are status
     changes, so both go through lib/pay-app-status like every other door.
     The legacy handlers wrote `status` directly — record-payment set a
     paid_at column that does not exist, skipped the waiver gate and the
     contract's paid_amount, and created waivers for a type nothing files. */
  if (segment && (subAction === 'submit' || subAction === 'record-payment')) {
    const g = await requirePermission(req, 'Pay Apps', subAction === 'submit' ? 'Edit' : 'Full');
    if (!g.ok) return g.res;
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const r = await transitionPayAppStatus(g.db, g.user.tenantId, segment, subAction === 'submit' ? 'submitted' : 'paid', {
        actorId: g.user.id,
        overrideWaivers: body.overrideWaivers === true,
        payment: subAction === 'record-payment' ? {
          amount: body.amountPaid != null && String(body.amountPaid).trim() !== '' ? Number(body.amountPaid) : null,
          method: typeof body.paymentMethod === 'string' ? body.paymentMethod : null,
          checkNumber: typeof body.checkNumber === 'string' ? body.checkNumber : null,
          receivedAt: typeof body.paidDate === 'string' && body.paidDate ? body.paidDate : null,
        } : undefined,
      });
      if (!r.ok) return NextResponse.json({ error: r.error, ...r.extra }, { status: r.status });
      return NextResponse.json({ success: true, changed: r.changed, ...r.extra });
    } catch (e) {
      return apiError(`pay-apps/[...path] ${subAction}`, e);
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
