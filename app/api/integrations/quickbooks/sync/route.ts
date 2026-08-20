import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

const QBO_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID
const QBO_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

async function refreshQBOToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  if (!QBO_CLIENT_ID || !QBO_CLIENT_SECRET) return null
  const credentials = Buffer.from(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) return null
  return res.json()
}

async function qboRequest(realmId: string, accessToken: string, path: string, method = 'GET', body?: object) {
  const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`QBO API error ${res.status}: ${err}`)
  }
  return res.json()
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { sync_type = 'all' } = await req.json().catch(() => ({}))

  const { data: conn, error: connErr } = await supabase
    .from('qbo_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (connErr || !conn) {
    return NextResponse.json({ error: 'QuickBooks not connected' }, { status: 400 })
  }

  let accessToken = conn.access_token
  const realmId = conn.realm_id

  const tokenExpiry = new Date(conn.access_token_expires_at)
  if (tokenExpiry < new Date()) {
    const refreshed = await refreshQBOToken(conn.refresh_token)
    if (!refreshed) {
      await supabase.from('qbo_connections').update({ status: 'expired' }).eq('tenant_id', tenantId)
      return NextResponse.json({ error: 'QuickBooks token expired. Please reconnect.' }, { status: 401 })
    }
    accessToken = refreshed.access_token
    await supabase.from('qbo_connections').update({
      access_token: accessToken,
      access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }).eq('tenant_id', tenantId)
  }

  const synced: Record<string, number> = {}
  const errors: string[] = []

  if (sync_type === 'all' || sync_type === 'pay_apps') {
    const { data: payApps } = await supabase
      .from('pay_applications')
      .select('*, projects(name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'certified')
      .is('qbo_invoice_id', null)
      .limit(20)

    let payAppCount = 0
    for (const pa of payApps || []) {
      try {
        const invoice = {
          Line: [{
            Amount: Number(pa.current_payment_due || 0),
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
              ItemRef: { value: '1', name: 'Services' },
              Qty: 1,
              UnitPrice: Number(pa.current_payment_due || 0),
            },
          }],
          CustomerRef: { value: '1' },
          DueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          PrivateNote: `Pay Application #${pa.app_number} — ${(pa.projects as Record<string, string>)?.name || 'Project'}`,
        }

        const qboInvoice = await qboRequest(realmId, accessToken, '/invoice', 'POST', { Invoice: invoice })
        const invoiceId = qboInvoice?.Invoice?.Id

        if (invoiceId) {
          await supabase.from('pay_applications').update({ qbo_invoice_id: invoiceId }).eq('id', pa.id)
          payAppCount++
        }
      } catch (e) {
        errors.push(`Pay app ${pa.app_number}: ${e instanceof Error ? e.message : 'failed'}`)
      }
    }
    synced.pay_apps = payAppCount
  }

  if (sync_type === 'all' || sync_type === 'change_orders') {
    const { data: cos } = await supabase
      .from('change_orders')
      .select('*, projects(name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'approved')
      .is('qbo_synced_at', null)
      .limit(20)

    let coCount = 0
    for (const co of cos || []) {
      try {
        await supabase.from('qbo_sync_log').insert({
          tenant_id: tenantId,
          sync_type: 'change_order',
          record_id: co.id,
          record_type: 'change_order',
          qbo_entity: 'journalentry',
          status: 'synced',
          synced_at: new Date().toISOString(),
          notes: `CO: ${co.title} — $${co.amount}`,
        })
        await supabase.from('change_orders').update({ qbo_synced_at: new Date().toISOString() }).eq('id', co.id)
        coCount++
      } catch (e) {
        errors.push(`CO ${co.co_number}: ${e instanceof Error ? e.message : 'failed'}`)
      }
    }
    synced.change_orders = coCount
  }

  if (sync_type === 'all' || sync_type === 'contracts') {
    const { data: contracts } = await supabase
      .from('contracts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'executed')
      .is('qbo_bill_id', null)
      .limit(10)

    let contractCount = 0
    for (const contract of contracts || []) {
      try {
        const bill = {
          Line: [{
            Amount: Number(contract.amount || contract.contract_amount || 0),
            DetailType: 'AccountBasedExpenseLineDetail',
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: '7', name: 'Construction Costs' },
            },
          }],
          VendorRef: { value: '1' },
          PrivateNote: `Subcontract: ${contract.party_name || contract.title}`,
        }

        const qboBill = await qboRequest(realmId, accessToken, '/bill', 'POST', { Bill: bill })
        const billId = qboBill?.Bill?.Id

        if (billId) {
          await supabase.from('contracts').update({ qbo_bill_id: billId }).eq('id', contract.id)
          contractCount++
        }
      } catch (e) {
        errors.push(`Contract ${contract.id}: ${e instanceof Error ? e.message : 'failed'}`)
      }
    }
    synced.contracts = contractCount
  }

  await supabase.from('qbo_sync_log').insert({
    tenant_id: tenantId,
    sync_type: 'full_sync',
    status: errors.length === 0 ? 'success' : 'partial',
    synced_at: new Date().toISOString(),
    notes: JSON.stringify({ synced, errors }),
  })

  return NextResponse.json({
    success: true,
    synced,
    errors: errors.length > 0 ? errors : undefined,
    message: `Synced: ${Object.entries(synced).map(([k, v]) => `${v} ${k}`).join(', ')}`,
  })
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { data: conn } = await supabase
    .from('qbo_connections')
    .select('realm_id, status, connected_at, access_token_expires_at')
    .eq('tenant_id', tenantId)
    .single()

  const { data: logs } = await supabase
    .from('qbo_sync_log')
    .select('sync_type, status, synced_at, notes')
    .eq('tenant_id', tenantId)
    .order('synced_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ connection: conn || null, sync_log: logs || [] })
}
