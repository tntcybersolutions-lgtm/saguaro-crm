import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Json } from '@/lib/database.types';
import { must, tryWrite } from '@/lib/db-write';

/* ------------------------------------------------------------------ */
/*  Intuit developer credentials (env). Without these QuickBooks is    */
/*  NOT operational — the route reports an honest "not configured"     */
/*  state instead of faking a successful sync.                         */
/* ------------------------------------------------------------------ */
const QB_CLIENT_ID     = process.env.QB_CLIENT_ID || process.env.QUICKBOOKS_CLIENT_ID || '';
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET || '';
const QB_SANDBOX       = process.env.QB_SANDBOX === 'true';
const QB_CONFIGURED    = !!(QB_CLIENT_ID && QB_CLIENT_SECRET);
const QB_BASE          = QB_SANDBOX
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';
const QB_TOKEN_URL     = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_MINOR_VERSION = '70';

// Saguaro entity -> QuickBooks resource path (POST) + query name (SELECT).
const QB_ENTITY: Record<string, { path: string; query: string; table: string }> = {
  invoices:  { path: 'invoice',  query: 'Invoice',  table: 'invoices' },
  bills:     { path: 'bill',     query: 'Bill',     table: 'bills' },
  customers: { path: 'customer', query: 'Customer', table: 'contacts' },
  vendors:   { path: 'vendor',   query: 'Vendor',   table: 'subcontractors' },
};

type EntityResult = { count: number; status: string; details?: string };

/* ------------------------------------------------------------------ */
/*  POST  /api/integrations/quickbooks/sync                           */
/*  Sync data between Saguaro and QuickBooks (real Intuit API calls)   */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { direction, entities } = body as {
      direction: 'push' | 'pull';
      entities: ('invoices' | 'bills' | 'customers' | 'vendors')[];
    };

    if (!direction || !entities || !entities.length) {
      return NextResponse.json(
        { error: 'direction and entities[] are required' },
        { status: 400 },
      );
    }

    // HONEST GATE 1 — platform credentials. QuickBooks cannot be reached (or a
    // token refreshed) without Intuit developer credentials. Never pretend.
    if (!QB_CONFIGURED) {
      return NextResponse.json(
        {
          error: 'QuickBooks is not configured on this server. Intuit developer credentials (QB_CLIENT_ID / QB_CLIENT_SECRET) are required before syncing.',
          configured: false,
        },
        { status: 503 },
      );
    }

    const db = createServerClient();

    // Fetch QuickBooks integration for tenant
    const { data: integration, error: intErr } = await db
      .from('integrations')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('provider', 'quickbooks')
      .eq('status', 'active')
      .single();

    // HONEST GATE 2 — this tenant has not completed the OAuth connection.
    if (intErr || !integration) {
      return NextResponse.json(
        { error: 'QuickBooks not connected — complete the OAuth authorization first.', configured: true, connected: false },
        { status: 409 },
      );
    }

    if (!integration.realm_id) {
      return NextResponse.json(
        { error: 'QuickBooks not connected — missing company (realm) id. Reconnect QuickBooks.', configured: true, connected: false },
        { status: 409 },
      );
    }

    // Ensure a live access token (refresh when expired). Honest failure if the
    // stored authorization can no longer be refreshed.
    const tokenResult = await ensureAccessToken(db, integration);
    if ('error' in tokenResult) {
      return NextResponse.json(
        { error: tokenResult.error, configured: true, connected: false },
        { status: tokenResult.status },
      );
    }

    const realmId = integration.realm_id as string;
    const accessToken = tokenResult.accessToken;
    const syncResults: Record<string, EntityResult> = {};

    // Process each entity type against the real Intuit API.
    for (const entity of entities) {
      try {
        if (direction === 'push') {
          syncResults[entity] = await pushToQuickBooks(db, user.tenantId, entity, realmId, accessToken);
        } else {
          syncResults[entity] = await pullFromQuickBooks(entity, realmId, accessToken);
        }
      } catch (entityErr) {
        syncResults[entity] = {
          count: 0,
          status: 'error',
          details: entityErr instanceof Error ? entityErr.message : 'Unknown error',
        };
      }
    }

    // Persist last_sync_at + append to sync history.
    const existingSettings = (integration.settings || {}) as Record<string, unknown> & { sync_history?: unknown[] };
    const syncHistory = (existingSettings.sync_history || []) as unknown[];
    syncHistory.unshift({
      timestamp: new Date().toISOString(),
      direction,
      entities,
      results: syncResults,
      initiated_by: user.email,
    });
    if (syncHistory.length > 50) syncHistory.length = 50;

    await tryWrite(db
      .from('integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        settings: { ...existingSettings, sync_history: syncHistory } as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id), 'integrations write');

    // Overall success = at least one entity succeeded and none hard-errored.
    const values = Object.values(syncResults);
    const anyError = values.some((r) => r.status === 'error');
    const anyPartial = values.some((r) => r.status === 'partial');

    return NextResponse.json({
      success: !anyError,
      partial: anyPartial,
      direction,
      results: syncResults,
      synced_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Token lifecycle — refresh the Intuit access token when expired.    */
/* ------------------------------------------------------------------ */
async function ensureAccessToken(
  db: ReturnType<typeof createServerClient>,
  integration: { id: string; access_token: string | null; refresh_token: string | null; token_expires_at: string | null },
): Promise<{ accessToken: string } | { error: string; status: number }> {
  const now = Date.now();
  const exp = integration.token_expires_at ? new Date(integration.token_expires_at).getTime() : 0;
  const stillValid = !!integration.access_token && exp - 60_000 > now;
  if (stillValid) return { accessToken: integration.access_token as string };

  // Expired (or unknown expiry) — refresh with the stored refresh token.
  if (!integration.refresh_token) {
    if (integration.access_token) return { accessToken: integration.access_token };
    return { error: 'QuickBooks not connected — no stored authorization. Reconnect QuickBooks.', status: 409 };
  }

  const refreshRes = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token,
    }).toString(),
  });

  if (!refreshRes.ok) {
    return { error: 'QuickBooks authorization expired — please reconnect QuickBooks.', status: 401 };
  }

  const tok = (await refreshRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const accessToken = tok.access_token;
  const refreshToken = tok.refresh_token || integration.refresh_token;
  const tokenExpiresAt = new Date(now + (tok.expires_in || 3600) * 1000).toISOString();

  await must(db
    .from('integrations')
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id), 'integrations write');

  return { accessToken };
}

/* ------------------------------------------------------------------ */
/*  Push — read from Saguaro, create the records in QuickBooks.        */
/* ------------------------------------------------------------------ */
async function pushToQuickBooks(
  db: ReturnType<typeof createServerClient>,
  tenantId: string,
  entity: string,
  realmId: string,
  accessToken: string,
): Promise<EntityResult> {
  const meta = QB_ENTITY[entity];
  if (!meta) return { count: 0, status: 'skipped', details: `Unknown entity: ${entity}` };

  // Dynamic table name — cast the query builder to avoid the generated
  // Supabase types trying to resolve a non-literal table (deep instantiation).
  const from = db.from as unknown as (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
        };
      };
    };
  };
  const { data: records, error } = await from(meta.table)
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  if (!records || records.length === 0) {
    return { count: 0, status: 'success', details: 'No records to sync' };
  }

  let created = 0;
  const errors: string[] = [];

  for (const record of records) {
    const payload = formatForQuickBooks(entity, record);
    const res = await fetch(
      `${QB_BASE}/v3/company/${realmId}/${meta.path}?minorversion=${QB_MINOR_VERSION}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (res.ok) {
      created++;
    } else {
      const errText = await res.text().catch(() => '');
      errors.push(errText.slice(0, 160));
    }
  }

  if (errors.length && created === 0) {
    return { count: 0, status: 'error', details: `QuickBooks rejected all records: ${errors[0]}` };
  }
  if (errors.length) {
    return { count: created, status: 'partial', details: `${created} pushed, ${errors.length} failed: ${errors[0]}` };
  }
  return { count: created, status: 'success', details: `${created} ${entity} pushed to QuickBooks` };
}

/* ------------------------------------------------------------------ */
/*  Pull — query QuickBooks for the records available for this entity. */
/* ------------------------------------------------------------------ */
async function pullFromQuickBooks(
  entity: string,
  realmId: string,
  accessToken: string,
): Promise<EntityResult> {
  const meta = QB_ENTITY[entity];
  if (!meta) return { count: 0, status: 'skipped', details: `Unknown entity: ${entity}` };

  const query = encodeURIComponent(`select * from ${meta.query} maxresults 100`);
  const res = await fetch(
    `${QB_BASE}/v3/company/${realmId}/query?query=${query}&minorversion=${QB_MINOR_VERSION}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { count: 0, status: 'error', details: `QuickBooks query failed: ${errText.slice(0, 160)}` };
  }

  const data = (await res.json()) as { QueryResponse?: Record<string, unknown[]> };
  const rows = (data?.QueryResponse?.[meta.query] as unknown[] | undefined) || [];
  return {
    count: rows.length,
    status: 'success',
    details: `Retrieved ${rows.length} ${entity} from QuickBooks`,
  };
}

function formatForQuickBooks(entity: string, record: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (entity) {
    case 'invoices':
      return {
        Line: [
          {
            Amount: record.total || record.amount || 0,
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
              ItemRef: { value: '1', name: 'Services' },
            },
            Description: record.description || `Invoice ${record.invoice_number || ''}`,
          },
        ],
        CustomerRef: { value: '1' },
        DocNumber: record.invoice_number || '',
        TxnDate: record.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        DueDate: record.due_date?.split('T')[0] || '',
      };
    case 'bills':
      return {
        VendorRef: { value: '1' },
        Line: [
          {
            Amount: record.total || record.amount || 0,
            DetailType: 'AccountBasedExpenseLineDetail',
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: '1' },
            },
            Description: record.description || '',
          },
        ],
        DocNumber: record.bill_number || '',
        TxnDate: record.created_at?.split('T')[0] || '',
        DueDate: record.due_date?.split('T')[0] || '',
      };
    case 'customers':
      return {
        DisplayName: record.name || record.company_name || '',
        PrimaryEmailAddr: { Address: record.email || '' },
        PrimaryPhone: { FreeFormNumber: record.phone || '' },
        CompanyName: record.company_name || record.name || '',
      };
    case 'vendors':
      return {
        DisplayName: record.company_name || record.name || '',
        PrimaryEmailAddr: { Address: record.email || '' },
        PrimaryPhone: { FreeFormNumber: record.phone || '' },
        CompanyName: record.company_name || '',
      };
    default:
      return record;
  }
}
