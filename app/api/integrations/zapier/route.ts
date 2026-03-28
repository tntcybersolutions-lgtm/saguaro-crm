import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/* ------------------------------------------------------------------ */
/*  Available Zapier triggers and actions for Saguaro                 */
/* ------------------------------------------------------------------ */
const ZAPIER_TRIGGERS = [
  { key: 'project.created', label: 'New Project Created', description: 'Triggers when a new project is added' },
  { key: 'project.updated', label: 'Project Updated', description: 'Triggers when a project is modified' },
  { key: 'invoice.created', label: 'New Invoice', description: 'Triggers when an invoice is created' },
  { key: 'invoice.sent', label: 'Invoice Sent', description: 'Triggers when an invoice is sent to a client' },
  { key: 'invoice.paid', label: 'Invoice Paid', description: 'Triggers when an invoice is marked as paid' },
  { key: 'pay_app.submitted', label: 'Pay App Submitted', description: 'Triggers when a pay application is submitted' },
  { key: 'pay_app.approved', label: 'Pay App Approved', description: 'Triggers when a pay application is approved' },
  { key: 'change_order.created', label: 'New Change Order', description: 'Triggers when a change order is created' },
  { key: 'change_order.approved', label: 'Change Order Approved', description: 'Triggers when a change order is approved' },
  { key: 'rfi.submitted', label: 'RFI Submitted', description: 'Triggers when an RFI is submitted' },
  { key: 'rfi.responded', label: 'RFI Responded', description: 'Triggers when an RFI receives a response' },
  { key: 'contract.signed', label: 'Contract Signed', description: 'Triggers when a contract is signed' },
  { key: 'daily_log.created', label: 'Daily Log Created', description: 'Triggers when a daily log is submitted' },
  { key: 'safety_incident.reported', label: 'Safety Incident', description: 'Triggers when a safety incident is reported' },
  { key: 'document.uploaded', label: 'Document Uploaded', description: 'Triggers when a document is uploaded' },
];

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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  POST  /api/integrations/zapier                                    */
/*  Register a Zapier webhook for a specific event                    */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
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
      await db
        .from('integrations')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existingInt.id);
    } else {
      await db.from('integrations').insert({
        tenant_id: user.tenantId,
        provider: 'zapier',
        status: 'active',
        settings: { webhook_count: 1 },
      });
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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
