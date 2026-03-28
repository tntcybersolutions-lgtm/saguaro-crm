import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/* ------------------------------------------------------------------ */
/*  POST  /api/integrations/sage300                                   */
/*  Setup Sage 300 integration — test connection + save config        */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { api_url, username, password, company_id, action } = body;

    // Handle disconnect action
    if (action === 'disconnect') {
      const db = createServerClient();
      await db
        .from('integrations')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('tenant_id', user.tenantId)
        .eq('provider', 'sage300');
      return NextResponse.json({ success: true, message: 'Sage 300 disconnected' });
    }

    if (!api_url) {
      return NextResponse.json({ error: 'api_url is required' }, { status: 400 });
    }

    // Test the connection by making a GET to the provided endpoint
    let connectionTest = { success: false, status: 0, message: '' };
    try {
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (username && password) {
        headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      const testRes = await fetch(api_url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });

      connectionTest = {
        success: testRes.ok,
        status: testRes.status,
        message: testRes.ok ? 'Connection successful' : `HTTP ${testRes.status}: ${testRes.statusText}`,
      };
    } catch (fetchErr: any) {
      connectionTest = {
        success: false,
        status: 0,
        message: fetchErr.name === 'TimeoutError'
          ? 'Connection timed out after 10 seconds'
          : `Connection failed: ${fetchErr.message}`,
      };
    }

    const db = createServerClient();

    // Save or update integration config regardless of test result
    const { data: existing } = await db
      .from('integrations')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .eq('provider', 'sage300')
      .maybeSingle();

    const integrationData = {
      tenant_id: user.tenantId,
      provider: 'sage300',
      status: connectionTest.success ? 'active' : 'error',
      settings: {
        api_url,
        company_id: company_id || '',
        has_credentials: !!(username && password),
        connection_test: connectionTest,
        configured_at: new Date().toISOString(),
        configured_by: user.email,
      },
      updated_at: new Date().toISOString(),
    };

    // Store credentials in access_token field (encrypted at DB level)
    if (username && password) {
      Object.assign(integrationData, {
        access_token: JSON.stringify({ username, password }),
      });
    }

    let integration;
    if (existing) {
      const { data, error } = await db
        .from('integrations')
        .update(integrationData)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      integration = data;
    } else {
      const { data, error } = await db
        .from('integrations')
        .insert(integrationData)
        .select()
        .single();
      if (error) throw error;
      integration = data;
    }

    return NextResponse.json({
      integration: {
        id: integration.id,
        provider: integration.provider,
        status: integration.status,
        settings: integration.settings,
      },
      connection_test: connectionTest,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
