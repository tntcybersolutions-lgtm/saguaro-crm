import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { WEBHOOK_EVENT_NAMES } from '@/lib/webhook-events';
import { apiError } from '@/lib/api-error';

/* ------------------------------------------------------------------ */
/*  /api/integrations/webhooks                                        */
/*  GET  → list this tenant's outbound webhooks                       */
/*  POST → create a webhook (url + events), generates a signing secret*/
/* ------------------------------------------------------------------ */

// The subscribable events MUST match what lib/triggers.ts actually emits,
// otherwise every webhook shows "Never fired". Single source of truth:
// lib/webhook-events.ts. Re-exported here for app/api/integrations/webhooks/[id].
export const WEBHOOK_EVENTS = WEBHOOK_EVENT_NAMES;

function validUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const p = new URL(url);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('outbound_webhooks')
      .select('id, name, url, events, active, last_status, last_fired_at, created_at')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ webhooks: data ?? [], available_events: WEBHOOK_EVENTS });
  } catch (e) {
    return apiError('integrations/webhooks GET', e);
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const url = body.url;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!validUrl(url)) return NextResponse.json({ error: 'A valid http(s) url is required' }, { status: 400 });

    const events: string[] = Array.isArray(body.events)
      ? body.events.filter((e: unknown): e is string => typeof e === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(e))
      : [];
    if (events.length === 0) return NextResponse.json({ error: 'At least one valid event is required', available_events: WEBHOOK_EVENTS }, { status: 400 });

    const secret = 'whsec_' + randomBytes(24).toString('hex');

    const db = createServerClient();
    const { data, error } = await db
      .from('outbound_webhooks')
      .insert({
        tenant_id: user.tenantId,
        created_by: user.id,
        name,
        url,
        events,
        secret,
        active: true,
      })
      .select('id, name, url, events, active, last_status, last_fired_at, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ webhook: data }, { status: 201 });
  } catch (e) {
    return apiError('integrations/webhooks POST', e);
  }
}
