import { NextRequest, NextResponse } from 'next/server';
import { sandboxCheckHandler } from '../../../../sandbox-manager-route';
import { SandboxManager } from '../../../../sandbox-manager';
import { supabaseAdmin } from '../../../../supabase/admin';
import { getUser } from '@/lib/supabase-server';

/**
 * /check and /signup are public by design — that is the trial funnel.
 *
 * /stats and /event were not. Both took the tenant id from the caller (a query
 * param and a request body) on an unauthenticated route backed by the service
 * role, so anyone holding a tenant UUID could read that tenant's sandbox usage
 * or write events against it. tenant_id never comes from the request; it comes
 * from the session. Neither endpoint has a caller anywhere in the app, so this
 * closes a door that was serving nobody.
 *
 * /lifecycle stays on the cron secret.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'check') return sandboxCheckHandler(req);

  if (segment === 'stats') {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Deliberately ignores ?tenantId= — the session decides whose stats these are.
    const stats = await SandboxManager.getUpsellStats(user.tenantId);
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

  /* The sandbox signup wrote to sandbox_tenants columns that do not exist, so
     it created an auth user and then failed. The free trial is /signup. */
  if (segment === 'signup') {
    return NextResponse.json({ error: 'Start your free trial at /signup.', redirect: '/signup' }, { status: 410 });
  }

  if (segment === 'event') {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    // body.tenantId is ignored on purpose. It used to decide which tenant got
    // the event written against it, which is the whole hole.
    const tenantId = user.tenantId;
    const eventType = String(body.eventType ?? '');
    if (!eventType) return Response.json({ error: 'eventType required' }, { status: 400 });
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
