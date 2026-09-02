import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const QB_CLIENT_ID     = process.env.QB_CLIENT_ID ?? '';
const QB_REDIRECT_URI  = process.env.QB_REDIRECT_URI ?? '';
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET ?? '';
const QB_SANDBOX       = process.env.QB_SANDBOX === 'true';
const QB_BASE          = QB_SANDBOX
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';
const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';

// Helper: read the connection regardless of legacy storage shape (some rows
// stored tokens top-level, some under settings{}). Always tenant-scoped.
function tokenOf(row: any): { access_token?: string; realm_id?: string; expires_at?: string } {
  if (!row) return {};
  return {
    access_token: row.access_token ?? row.settings?.access_token,
    realm_id: row.realm_id ?? row.settings?.realm_id,
    expires_at: row.token_expires_at ?? row.settings?.expires_at,
  };
}

export async function GET(req: NextRequest) {
  // AUTH + TENANT: these endpoints read tenant financial data and integration
  // tokens. Previously unauthenticated + service-role with no tenant filter,
  // which leaked every tenant's pay-app amounts and QB connection state.
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? 'status';

  if (action === 'connect') {
    // The callback resolves the tenant from the authed session (cookies), not
    // from `state`; state is a CSRF nonce only.
    const scope = 'com.intuit.quickbooks.accounting';
    const state = crypto.randomUUID();
    const url = `${AUTH_BASE}?client_id=${QB_CLIENT_ID}&redirect_uri=${encodeURIComponent(QB_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
    return NextResponse.redirect(url);
  }

  if (action === 'status') {
    const { data } = await getSupabase()
      .from('integrations')
      .select('id, access_token, token_expires_at, settings')
      .eq('provider', 'quickbooks')
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    const t = tokenOf(data);
    return NextResponse.json({ connected: !!t.access_token, expiresAt: t.expires_at ?? null, sandbox: QB_SANDBOX });
  }

  if (action === 'sync_preview') {
    const { data: invoices } = await getSupabase()
      .from('pay_applications')
      .select('id, app_number, net_payment_due, status, project_id')
      .eq('tenant_id', user.tenantId)
      .in('status', ['approved', 'submitted'])
      .limit(20);

    const { data: vendors } = await getSupabase()
      .from('subcontractors')
      .select('id, company_name')
      .eq('tenant_id', user.tenantId)
      .limit(20);

    return NextResponse.json({
      invoicesToSync:  (invoices ?? []).length,
      vendorsToSync:   (vendors ?? []).length,
      items: invoices ?? [],
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { action } = body as { action: string };

  if (action === 'callback') {
    // Exchange code for tokens and store them for THIS tenant (resolved from
    // the authed session — never from a client-supplied field).
    const { code, realmId } = body as { code: string; realmId: string };
    if (!code || !realmId) {
      return NextResponse.json({ error: 'Missing code or realmId' }, { status: 400 });
    }

    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: QB_REDIRECT_URI,
      }).toString(),
    });

    if (!tokenRes.ok) {
      return NextResponse.json({ error: 'Token exchange failed' }, { status: 502 });
    }

    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Tenant-scoped upsert via select-then-write (no global onConflict:'provider').
    const db = getSupabase();
    const { data: existing } = await db.from('integrations')
      .select('id').eq('provider', 'quickbooks').eq('tenant_id', user.tenantId).maybeSingle();
    const row = {
      provider: 'quickbooks',
      tenant_id: user.tenantId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      realm_id: realmId,
      status: 'active',
    };
    if (existing) await must(db.from('integrations').update(row).eq('id', existing.id), 'integrations update');
    else await must(db.from('integrations').insert(row), 'integrations insert');

    return NextResponse.json({ ok: true, expiresAt });
  }

  if (action === 'sync') {
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('access_token, realm_id, settings')
      .eq('provider', 'quickbooks')
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    const t = tokenOf(integration);
    if (!t.access_token) {
      return NextResponse.json({ error: 'QuickBooks not connected' }, { status: 401 });
    }

    const realmId     = t.realm_id as string;
    const accessToken = t.access_token as string;

    const { data: payApps } = await getSupabase()
      .from('pay_applications')
      .select('id, app_number, net_payment_due, project_id, projects(name)')
      .eq('tenant_id', user.tenantId)
      .eq('status', 'approved')
      .is('qbo_invoice_id', null)
      .limit(50);

    let synced = 0;
    const errors: string[] = [];

    for (const pa of payApps ?? []) {
      const invoicePayload = {
        Line: [{
          Amount: pa.net_payment_due,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: { ItemRef: { value: '1', name: 'Services' } },
        }],
        CustomerRef: { value: '1' }, // TODO: map to QB customer by project
        DocNumber: `PAY-${(pa as any).app_number}`,
        PrivateNote: `Saguaro Pay App #${(pa as any).app_number} | Project: ${(Array.isArray(pa.projects) ? (pa.projects as { name: string }[])[0]?.name : (pa.projects as unknown as { name: string } | null)?.name) ?? pa.project_id}`,
      };

      const res = await fetch(`${QB_BASE}/v3/company/${realmId}/invoice`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
          Accept:          'application/json',
        },
        body: JSON.stringify(invoicePayload),
      });

      if (res.ok) {
        const qbData = await res.json() as { Invoice?: { Id: string } };
        await must(getSupabase()
          .from('pay_applications')
          .update({ qbo_invoice_id: qbData.Invoice?.Id })
          .eq('id', pa.id)
          .eq('tenant_id', user.tenantId), 'pay_applications write');
        synced++;
      } else {
        const errText = await res.text();
        errors.push(`PayApp ${(pa as any).app_number}: ${errText.slice(0, 100)}`);
      }
    }

    return NextResponse.json({ ok: true, synced, errors, total: (payApps ?? []).length });
  }

  if (action === 'disconnect') {
    await must(getSupabase().from('integrations').delete()
      .eq('provider', 'quickbooks').eq('tenant_id', user.tenantId), 'integrations delete');
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
