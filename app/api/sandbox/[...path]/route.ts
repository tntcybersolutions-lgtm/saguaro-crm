import { NextRequest, NextResponse } from 'next/server';
import { sandboxCheckHandler, sandboxSignupHandler } from '../../../../sandbox-manager-route';
import { SandboxManager } from '../../../../sandbox-manager';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'check') return sandboxCheckHandler(req);

  if (segment === 'stats') {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) return Response.json({ error: 'tenantId required' }, { status: 400 });
    const stats = await SandboxManager.getUpsellStats(tenantId);
    return Response.json(stats);
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'signup') return sandboxSignupHandler(req);

  if (segment === 'event') {
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body.tenantId ?? '');
    const eventType = String(body.eventType ?? '');
    if (!tenantId || !eventType) return Response.json({ error: 'tenantId and eventType required' }, { status: 400 });
    const { data: sb } = await supabaseAdmin.from('sandbox_tenants').select('id').eq('tenant_id', tenantId).maybeSingle();
    if (!sb) return Response.json({ tracked: false });
    const result = await SandboxManager.trackSandboxEvent(sb.id as string, tenantId, eventType, body.eventData ?? {});
    return Response.json({ tracked: true, ...result });
  }

  if (segment === 'lifecycle') {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '');
    if (secret !== process.env.AUTOPILOT_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await SandboxManager.processSandboxLifecycleEmails();
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }});
}
