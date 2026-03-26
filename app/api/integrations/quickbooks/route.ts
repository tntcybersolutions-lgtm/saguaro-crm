import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const QB_CLIENT_ID     = process.env.QB_CLIENT_ID ?? '';
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET ?? '';
const QB_REDIRECT_URI  = process.env.QB_REDIRECT_URI ?? '';
const QB_SANDBOX       = process.env.QB_SANDBOX === 'true';
const QB_BASE          = QB_SANDBOX
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';
const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? 'status';

  if (action === 'connect') {
    // Redirect user to QuickBooks OAuth
    const scope = 'com.intuit.quickbooks.accounting';
    const state = crypto.randomUUID();
    const url = `${AUTH_BASE}?client_id=${QB_CLIENT_ID}&redirect_uri=${encodeURIComponent(QB_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
    return NextResponse.redirect(url);
  }

  if (action === 'status') {
    // Check if we have a stored token
    const { data } = await getSupabase()
      .from('integrations')
      .select('id, meta')
      .eq('provider', 'quickbooks')
      .maybeSingle();
    const connected = !!data?.meta?.access_token;
    const expiresAt = data?.meta?.expires_at ?? null;
    return NextResponse.json({ connected, expiresAt, sandbox: QB_SANDBOX });
  }

  if (action === 'sync_preview') {
    // Return what would be synced without actually syncing
    const { data: invoices } = await getSupabase()
      .from('pay_applications')
      .select('id, application_number, net_amount_due, status, project_id')
      .in('status', ['approved', 'submitted'])
      .limit(20);

    const { data: vendors } = await getSupabase()
      .from('subcontractors')
      .select('id, name, contract_amount')
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
  const body = await req.json().catch(() => ({}));
  const { action } = body as { action: string };

  if (action === 'callback') {
    // Handle OAuth callback — exchange code for tokens
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

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await getSupabase().from('integrations').upsert({
      provider: 'quickbooks',
      meta: {
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at:    expiresAt,
        realm_id:      realmId,
      },
    }, { onConflict: 'provider' });

    return NextResponse.json({ ok: true, expiresAt });
  }

  if (action === 'sync') {
    // Push approved pay apps as invoices to QuickBooks
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('meta')
      .eq('provider', 'quickbooks')
      .maybeSingle();

    if (!integration?.meta?.access_token) {
      return NextResponse.json({ error: 'QuickBooks not connected' }, { status: 401 });
    }

    const realmId     = integration.meta.realm_id as string;
    const accessToken = integration.meta.access_token as string;

    const { data: payApps } = await getSupabase()
      .from('pay_applications')
      .select('id, application_number, net_amount_due, project_id, projects(name)')
      .eq('status', 'approved')
      .is('qb_synced_at', null)
      .limit(50);

    let synced = 0;
    const errors: string[] = [];

    for (const pa of payApps ?? []) {
      // Resolve the QB customer for this project.
      // Lookup chain: project.qb_customer_id → qb_customer_map by project_id → create new QB customer.
      const projectName = (Array.isArray(pa.projects)
        ? (pa.projects as { name: string }[])[0]?.name
        : (pa.projects as unknown as { name: string } | null)?.name) ?? 'Unknown Project';

      let qbCustomerRef = '1'; // fallback

      // 1. Check if project has a stored QB customer ID
      const { data: projectRow } = await getSupabase()
        .from('projects')
        .select('qb_customer_id, owner_name')
        .eq('id', pa.project_id)
        .maybeSingle();

      if (projectRow?.qb_customer_id) {
        qbCustomerRef = projectRow.qb_customer_id;
      } else {
        // 2. Query QB for existing customer by project owner name or project name
        const customerName = projectRow?.owner_name || projectName;
        const queryRes = await fetch(
          `${QB_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${customerName.replace(/'/g, "\\'")}'`)}`,
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
        );

        let existingCustomerId: string | null = null;
        if (queryRes.ok) {
          const queryData = await queryRes.json();
          existingCustomerId = queryData?.QueryResponse?.Customer?.[0]?.Id ?? null;
        }

        if (existingCustomerId) {
          qbCustomerRef = existingCustomerId;
        } else {
          // 3. Create customer in QB
          const createRes = await fetch(`${QB_BASE}/v3/company/${realmId}/customer`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ DisplayName: customerName, CompanyName: customerName }),
          });
          if (createRes.ok) {
            const newCust = await createRes.json() as { Customer?: { Id: string } };
            qbCustomerRef = newCust.Customer?.Id ?? '1';
          }
        }

        // 4. Cache the mapping on the project row for next time
        if (qbCustomerRef !== '1') {
          await getSupabase()
            .from('projects')
            .update({ qb_customer_id: qbCustomerRef })
            .eq('id', pa.project_id);
        }
      }

      const invoicePayload = {
        Line: [{
          Amount: pa.net_amount_due,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Services' },
          },
        }],
        CustomerRef: { value: qbCustomerRef },
        DocNumber: `PAY-${(pa as any).application_number}`,
        PrivateNote: `Saguaro Pay App #${(pa as any).application_number} | Project: ${projectName}`,
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
        await getSupabase()
          .from('pay_applications')
          .update({ qb_synced_at: new Date().toISOString(), qb_invoice_id: qbData.Invoice?.Id })
          .eq('id', pa.id);
        synced++;
      } else {
        const errText = await res.text();
        errors.push(`PayApp ${(pa as any).application_number}: ${errText.slice(0, 100)}`);
      }
    }

    return NextResponse.json({ ok: true, synced, errors, total: (payApps ?? []).length });
  }

  if (action === 'disconnect') {
    await getSupabase().from('integrations').delete().eq('provider', 'quickbooks');
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
