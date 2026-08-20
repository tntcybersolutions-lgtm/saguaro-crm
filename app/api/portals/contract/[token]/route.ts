import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

// Public read — returns the contract HTML + status for signing portal.
// No user session — token authenticates.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 8) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })

  const db = createServerClient()
  const { data: contract, error } = await db
    .from('contracts')
    .select('id, title, contract_number, party_name, party_company, amount, status, html_content, sub_signed_at')
    .eq('signing_token', token)
    .maybeSingle()

  if (error || !contract) return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 })

  return NextResponse.json({
    contractId: contract.id,
    title: contract.title,
    contractNumber: contract.contract_number,
    partyName: contract.party_name,
    partyCompany: contract.party_company,
    amount: contract.amount,
    status: contract.status,
    html: contract.html_content || '',
    signed: !!contract.sub_signed_at,
  })
}
