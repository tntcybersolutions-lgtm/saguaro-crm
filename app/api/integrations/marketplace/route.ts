import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

/* ------------------------------------------------------------------ */
/*  GET  /api/integrations/marketplace                                */
/*  Returns all integrations for the tenant + catalog of available    */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    // Fetch tenant's connected integrations
    const { data: connected, error } = await db
      .from('integrations')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Full catalog of available integrations
    const catalog = [
      {
        key: 'quickbooks',
        name: 'QuickBooks Online',
        category: 'accounting',
        description: 'Sync invoices, bills, and payments bi-directionally',
        icon_color: '#2CFF7A',
        auth_type: 'oauth2',
        available: true,
      },
      {
        // Coming soon: no working sync path yet, and we will not persist AP
        // credentials until the real Sage 300 connector ships. Kept honest.
        key: 'sage300',
        name: 'Sage 300',
        category: 'accounting',
        description: 'Enterprise accounting integration for large GCs (coming soon)',
        icon_color: '#00A651',
        auth_type: 'api_key',
        available: false,
      },
      {
        // Coming soon: OAuth start exists but there is no callback/token-exchange
        // or sync yet, so it is not advertised as a working integration.
        key: 'xero',
        name: 'Xero',
        category: 'accounting',
        description: 'Cloud accounting sync for invoices and bills (coming soon)',
        icon_color: '#FF8A00',
        auth_type: 'oauth2',
        available: false,
      },
      {
        key: 'procore',
        name: 'Procore',
        category: 'project_management',
        description: 'Import projects, RFIs, and submittals from Procore',
        icon_color: '#F47E20',
        auth_type: 'oauth2',
        available: false,
      },
      {
        key: 'plangrid',
        name: 'PlanGrid',
        category: 'project_management',
        description: 'Import drawings and field reports',
        icon_color: '#0075C9',
        auth_type: 'oauth2',
        available: false,
      },
      {
        key: 'docusign',
        name: 'DocuSign',
        category: 'documents',
        description: 'E-signature integration for contracts and lien waivers',
        icon_color: '#FFD700',
        auth_type: 'oauth2',
        available: false,
      },
      {
        key: 'microsoft365',
        name: 'Microsoft 365',
        category: 'communication',
        description: 'Calendar, email, and Teams integration',
        icon_color: '#0078D4',
        auth_type: 'oauth2',
        available: false,
      },
      {
        key: 'google_workspace',
        name: 'Google Workspace',
        category: 'communication',
        description: 'Gmail, Calendar, and Drive sync',
        icon_color: '#4285F4',
        auth_type: 'oauth2',
        available: false,
      },
      {
        key: 'dropbox',
        name: 'Dropbox',
        category: 'storage',
        description: 'Cloud file storage sync',
        icon_color: '#0061FF',
        auth_type: 'oauth2',
        available: false,
      },
      {
        key: 'box',
        name: 'Box',
        category: 'storage',
        description: 'Enterprise file storage',
        icon_color: '#0061D5',
        auth_type: 'oauth2',
        available: false,
      },
      {
        key: 'zapier',
        name: 'Zapier',
        category: 'custom',
        description: 'Connect to 5000+ apps via Zapier',
        icon_color: '#FF4A00',
        auth_type: 'webhook',
        available: true,
      },
      {
        key: 'custom_api',
        name: 'Custom API',
        category: 'custom',
        description: 'Build custom integrations with our REST API',
        icon_color: '#6B7280',
        auth_type: 'api_key',
        available: true,
      },
    ];

    // Merge connection status into catalog
    const connectedMap = new Map(
      (connected || []).map((c: any) => [c.provider, c]),
    );

    const integrations = catalog.map((item) => {
      const conn = connectedMap.get(item.key) as any;
      return {
        ...item,
        connected: !!conn && conn.status === 'active',
        status: conn?.status || null,
        last_sync_at: conn?.last_sync_at || null,
        integration_id: conn?.id || null,
        settings: conn?.settings || {},
      };
    });

    return NextResponse.json({ integrations });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  POST  /api/integrations/marketplace                               */
/*  Enable / connect an integration for a tenant                      */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { provider, settings } = body;

    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }

    // The page uses THIS route to disconnect generic providers too, POSTing
    // { provider, settings:{ status:'disconnected' } }. The old code hardcoded
    // status:'active' on the existing-row branch, so a "disconnect" silently
    // RE-ACTIVATED the integration (GET treats status==='active' as connected).
    // Honor an explicit disconnect intent from either the top level or settings.
    const wantsDisconnect =
      body.status === 'disconnected' ||
      (settings && typeof settings === 'object' && settings.status === 'disconnected');
    const targetStatus = wantsDisconnect ? 'disconnected' : 'active';

    const db = createServerClient();

    // Check if integration already exists for this tenant+provider
    const { data: existing } = await db
      .from('integrations')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .eq('provider', provider)
      .maybeSingle();

    if (existing) {
      // Reflect the requested state (connect → active, disconnect → disconnected).
      const { data, error } = await db
        .from('integrations')
        .update({
          status: targetStatus,
          settings: settings || {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ integration: data });
    }

    // Create new integration record
    const { data, error } = await db
      .from('integrations')
      .insert({
        tenant_id: user.tenantId,
        provider,
        status: 'pending',
        settings: settings || {},
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ integration: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
