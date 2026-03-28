import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || '';
const XERO_REDIRECT_URI = process.env.XERO_REDIRECT_URI || '';
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_SCOPES = 'openid profile email accounting.transactions accounting.contacts accounting.settings offline_access';

/* ------------------------------------------------------------------ */
/*  POST  /api/integrations/xero                                      */
/*  Xero integration setup — returns OAuth URL or disconnects         */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const db = createServerClient();

    // Handle disconnect
    if (action === 'disconnect') {
      await db
        .from('integrations')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('tenant_id', user.tenantId)
        .eq('provider', 'xero');
      return NextResponse.json({ success: true, message: 'Xero disconnected' });
    }

    // Generate OAuth2 authorization URL
    if (action === 'connect' || !action) {
      // Create/update pending integration record
      const { data: existing } = await db
        .from('integrations')
        .select('id')
        .eq('tenant_id', user.tenantId)
        .eq('provider', 'xero')
        .maybeSingle();

      if (existing) {
        await db
          .from('integrations')
          .update({
            status: 'pending',
            settings: {
              sync_invoices: body.sync_invoices ?? true,
              sync_bills: body.sync_bills ?? true,
              sync_contacts: body.sync_contacts ?? true,
              sync_direction: body.sync_direction ?? 'bidirectional',
              sync_frequency: body.sync_frequency ?? 'manual',
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await db.from('integrations').insert({
          tenant_id: user.tenantId,
          provider: 'xero',
          status: 'pending',
          settings: {
            sync_invoices: body.sync_invoices ?? true,
            sync_bills: body.sync_bills ?? true,
            sync_contacts: body.sync_contacts ?? true,
            sync_direction: body.sync_direction ?? 'bidirectional',
            sync_frequency: body.sync_frequency ?? 'manual',
          },
        });
      }

      // Build the Xero OAuth2 authorization URL
      const authUrl = new URL(XERO_AUTH_URL);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', XERO_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', XERO_REDIRECT_URI);
      authUrl.searchParams.set('scope', XERO_SCOPES);
      authUrl.searchParams.set('state', user.tenantId);

      return NextResponse.json({
        auth_url: authUrl.toString(),
        message: 'Redirect user to auth_url to complete Xero OAuth',
      });
    }

    // Handle settings update
    if (action === 'update_settings') {
      const { data, error } = await db
        .from('integrations')
        .update({
          settings: {
            sync_invoices: body.sync_invoices ?? true,
            sync_bills: body.sync_bills ?? true,
            sync_contacts: body.sync_contacts ?? true,
            sync_direction: body.sync_direction ?? 'bidirectional',
            sync_frequency: body.sync_frequency ?? 'manual',
          },
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', user.tenantId)
        .eq('provider', 'xero')
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ integration: data });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
