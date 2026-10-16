import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { WEBHOOK_EVENTS } from '../route';
import { apiError } from '@/lib/api-error';

/* ------------------------------------------------------------------ */
/*  /api/integrations/webhooks/[id]                                   */
/*  PUT    → update name/url/events/active (tenant-scoped)            */
/*  DELETE → remove the webhook (tenant-scoped)                       */
/* ------------------------------------------------------------------ */

function validUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const p = new URL(url);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (body.url !== undefined) {
      if (!validUrl(body.url)) return NextResponse.json({ error: 'A valid http(s) url is required' }, { status: 400 });
      patch.url = body.url;
    }
    if (body.events !== undefined) {
      const events: string[] = Array.isArray(body.events)
        ? body.events.filter((e: unknown): e is string => typeof e === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(e))
        : [];
      if (events.length === 0) return NextResponse.json({ error: 'At least one valid event is required', available_events: WEBHOOK_EVENTS }, { status: 400 });
      patch.events = events;
    }
    if (typeof body.active === 'boolean') patch.active = body.active;

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });

    const db = createServerClient();
    const { data, error } = await db
      .from('outbound_webhooks')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id, name, url, events, active, last_status, last_fired_at, created_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ webhook: data });
  } catch (e) {
    return apiError('integrations/webhooks/[id] PUT', e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const db = createServerClient();
    const { data, error } = await db
      .from('outbound_webhooks')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, id: data.id });
  } catch (e) {
    return apiError('integrations/webhooks/[id] DELETE', e);
  }
}
