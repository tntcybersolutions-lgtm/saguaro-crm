import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';
import { isQuickBooksConfigured } from '@/lib/quickbooks/config';
import { stripSecrets } from '@/lib/quickbooks/settings';

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
        description: 'Send approved pay apps to QuickBooks as invoices, and your subs as vendors',
        icon_color: '#2CFF7A',
        auth_type: 'oauth2',
        // Only offered when the server holds the Intuit app keys — otherwise
        // Connect would send the GC to a broken Intuit page. A tenant that is
        // already connected still sees its card (the page filters on
        // available || connected).
        available: isQuickBooksConfigured(),
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
        // Settings reach the browser: never a token, secret or password, at
        // any depth (older QuickBooks rows kept their tokens in here).
        settings: stripSecrets(conn?.settings || {}),
      };
    });

    return NextResponse.json({ integrations });
  } catch (e) {
    return apiError('integrations/marketplace', e, 'Could not load integrations. Please try again.');
  }
}

/** What a POST hands back — never the token columns. */
const SAFE_COLUMNS = 'id, provider, status, settings, last_sync_at, created_at, updated_at';

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

    // QuickBooks connects only through Intuit sign-in (/api/integrations/quickbooks)
    // and disconnects through the same route, which revokes the token. A generic
    // write here would mark it active with no tokens, or overwrite its settings.
    if (provider === 'quickbooks') {
      return apiFail('QuickBooks connects and disconnects through its own page: /app/integrations/quickbooks.', 400);
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
        .eq('tenant_id', user.tenantId)
        .eq('id', existing.id)
        .select(SAFE_COLUMNS)
        .single();

      if (error) throw error;
      return NextResponse.json({ integration: { ...data, settings: stripSecrets(data?.settings ?? {}) } });
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
      .select(SAFE_COLUMNS)
      .single();

    if (error) throw error;

    return NextResponse.json({ integration: { ...data, settings: stripSecrets(data?.settings ?? {}) } }, { status: 201 });
  } catch (e) {
    return apiError('integrations/marketplace POST', e, 'Could not update the integration. Please try again.');
  }
}
