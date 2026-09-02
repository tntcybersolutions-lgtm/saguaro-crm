import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { tryWrite } from '@/lib/db-write';

/* ------------------------------------------------------------------ */
/*  POST /api/integrations/webhooks/[id]/test                         */
/*  Sends a sample event to the webhook URL, signed with an           */
/*  X-Saguaro-Signature HMAC-SHA256 header derived from the stored    */
/*  secret. Records last_status + last_fired_at. Tenant-scoped.       */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const db = createServerClient();

    const { data: hook, error: fetchErr } = await db
      .from('outbound_webhooks')
      .select('id, url, secret, events')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!hook) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const eventType = (hook.events && hook.events[0]) || 'rfi.created';
    const payload = {
      event: eventType,
      test: true,
      timestamp: new Date().toISOString(),
      data: {
        id: '00000000-0000-0000-0000-000000000000',
        message: `Sample "${eventType}" event from Saguaro Control Systems`,
      },
    };
    const bodyStr = JSON.stringify(payload);

    // HMAC-SHA256 signature over the exact request body, using the webhook secret.
    if (!hook.secret) {
      return NextResponse.json({ error: 'Webhook has no signing secret — edit it and set one before testing' }, { status: 400 });
    }
    const signature = createHmac('sha256', hook.secret).update(bodyStr).digest('hex');

    let status = 0;
    let errorMsg: string | undefined;
    const startedAt = Date.now();
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Saguaro-Event': eventType,
          'X-Saguaro-Signature': `sha256=${signature}`,
          'User-Agent': 'Saguaro-Webhooks/1.0',
        },
        body: bodyStr,
        signal: AbortSignal.timeout(15000),
      });
      status = res.status;
    } catch (err) {
      status = 0;
      errorMsg = err instanceof Error
        ? (err.name === 'TimeoutError' ? 'Request timed out after 15 seconds' : err.message)
        : 'Delivery failed';
    }

    const firedAt = new Date().toISOString();
    await tryWrite(db
      .from('outbound_webhooks')
      .update({ last_status: status, last_fired_at: firedAt })
      .eq('id', id)
      .eq('tenant_id', user.tenantId), 'outbound_webhooks write');

    return NextResponse.json({
      success: status >= 200 && status < 300,
      status,
      response_time_ms: Date.now() - startedAt,
      last_fired_at: firedAt,
      event_type: eventType,
      ...(errorMsg ? { error: errorMsg } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
