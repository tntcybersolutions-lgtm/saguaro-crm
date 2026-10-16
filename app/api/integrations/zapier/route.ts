import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { WEBHOOK_EVENT_CATALOG } from '@/lib/webhook-events';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

/* ------------------------------------------------------------------ */
/*  Available Zapier triggers and actions for Saguaro                 */
/* ------------------------------------------------------------------ */
// Triggers are exactly the events Saguaro actually emits (single source of
// truth: lib/webhook-events.ts). Registering here writes a webhook_endpoints
// row that the dispatcher (lib/webhook-dispatch.ts) then delivers to — so a
// registered Zapier trigger genuinely fires rather than advertising a dead event.
const ZAPIER_TRIGGERS = WEBHOOK_EVENT_CATALOG.map((e) => ({
  key: e.event,
  label: e.description,
  description: e.description,
}));

const ZAPIER_ACTIONS = [
  { key: 'create_project', label: 'Create Project', description: 'Creates a new project in Saguaro' },
  { key: 'create_invoice', label: 'Create Invoice', description: 'Creates a new invoice' },
  { key: 'create_contact', label: 'Create Contact', description: 'Creates a new contact/subcontractor' },
  { key: 'create_rfi', label: 'Create RFI', description: 'Creates a new RFI' },
  { key: 'create_daily_log', label: 'Create Daily Log', description: 'Creates a new daily log entry' },
  { key: 'update_project_status', label: 'Update Project Status', description: 'Updates a project status' },
  { key: 'add_document', label: 'Add Document', description: 'Uploads a document to a project' },
];

/* ------------------------------------------------------------------ */
/*  GET  /api/integrations/zapier                                     */
/*  Returns available Zapier triggers and actions                     */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    // Get registered webhooks for this tenant
    const { data: webhooks } = await db
      .from('webhook_endpoints')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      triggers: ZAPIER_TRIGGERS,
      actions: ZAPIER_ACTIONS,
      registered_webhooks: webhooks || [],
      documentation_url: '/app/integrations/api-docs',
    });
  } catch (e) {
    return apiError('integrations/zapier GET', e);
  }
}

/* ------------------------------------------------------------------ */
/*  POST  /api/integrations/zapier                                    */
/*  Register a Zapier webhook for a specific event                    */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { url, events, action } = body;

    const db = createServerClient();

    // Handle unsubscribe
    if (action === 'unsubscribe' && body.webhook_id) {
      const { error } = await db
        .from('webhook_endpoints')
        .update({ is_active: false })
        .eq('id', body.webhook_id)
        .eq('tenant_id', user.tenantId);

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Webhook deactivated' });
    }

    // Register new webhook
    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    // Validate URL
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'URL must use http or https' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const eventList = events && events.length > 0
      ? events
      : ['project.created']; // Default event

    // Validate events
    const validEvents = ZAPIER_TRIGGERS.map((t) => t.key);
    const invalidEvents = eventList.filter((e: string) => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(', ')}`, valid_events: validEvents },
        { status: 400 },
      );
    }

    // Generate a webhook secret
    const secret = 'whsec_' + Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const { data, error } = await db
      .from('webhook_endpoints')
      .insert({
        tenant_id: user.tenantId,
        url,
        secret,
        events: eventList,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    // Also ensure zapier integration is marked as connected
    const { data: existingInt } = await db
      .from('integrations')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .eq('provider', 'zapier')
      .maybeSingle();

    if (existingInt) {
      await must(db
        .from('integrations')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existingInt.id), 'integrations write');
    } else {
      await must(db.from('integrations').insert({
        tenant_id: user.tenantId,
        provider: 'zapier',
        status: 'active',
        settings: { webhook_count: 1 },
      }), 'integrations insert');
    }

    return NextResponse.json({
      webhook: {
        id: data.id,
        url: data.url,
        events: data.events,
        secret,
        is_active: true,
        created_at: data.created_at,
      },
      message: 'Webhook registered successfully. Store the secret securely.',
    }, { status: 201 });
  } catch (e) {
    return apiError('integrations/zapier POST', e);
  }
}
