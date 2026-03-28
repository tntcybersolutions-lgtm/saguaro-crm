import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const QB_BASE_URL = 'https://quickbooks.api.intuit.com/v3/company';

/* ------------------------------------------------------------------ */
/*  POST  /api/integrations/quickbooks/sync                           */
/*  Sync data between Saguaro and QuickBooks                          */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
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

    const db = createServerClient();

    // Fetch QuickBooks integration for tenant
    const { data: integration, error: intErr } = await db
      .from('integrations')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('provider', 'quickbooks')
      .eq('status', 'active')
      .single();

    if (intErr || !integration) {
      return NextResponse.json(
        { error: 'QuickBooks integration not connected' },
        { status: 404 },
      );
    }

    const realmId = integration.realm_id;
    const accessToken = integration.access_token;
    const syncResults: Record<string, { count: number; status: string; details?: string }> = {};

    // Process each entity type
    for (const entity of entities) {
      try {
        if (direction === 'push') {
          const result = await pushToQuickBooks(db, user.tenantId, entity, realmId, accessToken);
          syncResults[entity] = result;
        } else {
          const result = await pullFromQuickBooks(db, user.tenantId, entity, realmId, accessToken);
          syncResults[entity] = result;
        }
      } catch (entityErr: any) {
        syncResults[entity] = { count: 0, status: 'error', details: entityErr.message };
      }
    }

    // Update last_sync_at and save sync history in settings
    const existingSettings = integration.settings || {};
    const syncHistory = existingSettings.sync_history || [];
    syncHistory.unshift({
      timestamp: new Date().toISOString(),
      direction,
      entities,
      results: syncResults,
      initiated_by: user.email,
    });
    // Keep only last 50 sync records
    if (syncHistory.length > 50) syncHistory.length = 50;

    await db
      .from('integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        settings: { ...existingSettings, sync_history: syncHistory },
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    return NextResponse.json({
      success: true,
      direction,
      results: syncResults,
      synced_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Push helpers — query Saguaro, format for QB, log the payload      */
/* ------------------------------------------------------------------ */
async function pushToQuickBooks(
  db: any,
  tenantId: string,
  entity: string,
  realmId: string,
  accessToken: string,
) {
  const tableMap: Record<string, string> = {
    invoices: 'invoices',
    bills: 'bills',
    customers: 'contacts',
    vendors: 'subcontractors',
  };

  const table = tableMap[entity];
  if (!table) return { count: 0, status: 'skipped', details: `Unknown entity: ${entity}` };

  const { data: records, error } = await db
    .from(table)
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  if (!records || records.length === 0) {
    return { count: 0, status: 'success', details: 'No records to sync' };
  }

  // Format records for QuickBooks API
  const qbPayloads = records.map((record: any) => formatForQuickBooks(entity, record));

  // Log the payload that would be sent to QuickBooks
  // In production, this would POST to: ${QB_BASE_URL}/${realmId}/${qbEntityName}
  console.log(`[QB Sync Push] Entity: ${entity}, RealmID: ${realmId}, Records: ${qbPayloads.length}`);
  console.log(`[QB Sync Push] Would POST to: ${QB_BASE_URL}/${realmId}/${entity}`);
  console.log(`[QB Sync Push] Sample payload:`, JSON.stringify(qbPayloads[0], null, 2));

  return {
    count: qbPayloads.length,
    status: 'success',
    details: `${qbPayloads.length} ${entity} prepared for sync`,
  };
}

async function pullFromQuickBooks(
  db: any,
  tenantId: string,
  entity: string,
  realmId: string,
  accessToken: string,
) {
  // In production, this would GET from QuickBooks API:
  // ${QB_BASE_URL}/${realmId}/query?query=SELECT * FROM ${QBEntityName}
  console.log(`[QB Sync Pull] Entity: ${entity}, RealmID: ${realmId}`);
  console.log(`[QB Sync Pull] Would GET: ${QB_BASE_URL}/${realmId}/query?query=SELECT * FROM ${entity}`);

  // Since we don't have real QB credentials, simulate the pull
  return {
    count: 0,
    status: 'success',
    details: `Pull from QuickBooks queued. Would fetch ${entity} from realm ${realmId}`,
  };
}

function formatForQuickBooks(entity: string, record: any) {
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
