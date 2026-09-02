import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { encryptSecret, hasEncryptionKey } from '@/lib/crypto-secrets';
import { must } from '@/lib/db-write';

/* ------------------------------------------------------------------ */
/*  POST  /api/integrations/sage300                                   */
/*  Setup Sage 300 integration — test connection + save config        */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { api_url, username, password, company_id, action } = body;

    // Handle disconnect action
    if (action === 'disconnect') {
      const db = createServerClient();
      await must(db
        .from('integrations')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('tenant_id', user.tenantId)
        .eq('provider', 'sage300'), 'integrations write');
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

    // SECURITY: never store AP credentials in plaintext. Encrypt them at rest
    // with AES-256-GCM (lib/crypto-secrets). If no STORAGE_ENCRYPTION_KEY is
    // configured we REFUSE to persist the secret at all rather than fall back
    // to plaintext — the config is saved without credentials and the response
    // tells the caller they were not stored.
    const hasCreds = !!(username && password);
    const canEncrypt = hasEncryptionKey();
    const credentialsStored = hasCreds && canEncrypt;

    const integrationData = {
      tenant_id: user.tenantId,
      provider: 'sage300',
      status: connectionTest.success ? 'active' : 'error',
      settings: {
        api_url,
        company_id: company_id || '',
        has_credentials: credentialsStored,
        credentials_not_stored_reason:
          hasCreds && !canEncrypt
            ? 'Encryption key not configured on server; credentials were not persisted.'
            : null,
        connection_test: connectionTest,
        configured_at: new Date().toISOString(),
        configured_by: user.email,
      },
      updated_at: new Date().toISOString(),
    };

    if (credentialsStored) {
      // Store as iv|authTag|ciphertext (base64), AES-256-GCM. Decrypt with
      // decryptSecret() when the real Sage 300 sync connector is built. We NEVER
      // write plaintext; when no key is configured the secret is not persisted.
      Object.assign(integrationData, { access_token: encryptSecret({ username, password }) });
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
