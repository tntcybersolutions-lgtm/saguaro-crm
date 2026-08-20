import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const [pkgRes, settingsRes] = await Promise.all([
      db.from('bid_packages')
        .select(`
          *, projects!inner(
            name, address, city, state, zip,
            estimated_completion, contract_value
          )
        `)
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .single(),
      db.from('tenant_settings')
        .select('*')
        .eq('tenant_id', user.tenantId)
        .maybeSingle(),
    ])

    if (pkgRes.error || !pkgRes.data)
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })

    const pkg = pkgRes.data
    const settings = settingsRes.data
    const project = pkg.projects as {
      name: string; address: string; city: string; state: string; zip: string
      estimated_completion: string; contract_value: number
    }

    // Load winning bid for sub info
    const { data: winningBid } = await db
      .from('bid_submissions')
      .select('company_name,contact_name,contact_email,contact_phone,base_bid,base_amount,license_number,exclusions')
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId)
      .eq('is_awarded', true)
      .maybeSingle()

    const awardedAmount = pkg.awarded_amount || winningBid?.base_bid || winningBid?.base_amount || 0
    const amtStr = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0,
    }).format(Number(awardedAmount))

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `You are a construction attorney drafting a subcontract agreement.
Write a complete, professional subcontract agreement using the following information.

GENERAL CONTRACTOR:
Company: ${settings?.company_name || 'General Contractor'}
License: ${settings?.license_number || 'AZ License'}
Address: ${settings?.company_address || ''}, ${settings?.company_city || ''}, AZ ${settings?.company_zip || ''}
Phone: ${settings?.company_phone || ''}
Email: ${settings?.company_email || ''}

SUBCONTRACTOR:
Company: ${winningBid?.company_name || pkg.awarded_to || 'Subcontractor'}
Contact: ${winningBid?.contact_name || ''}
Email: ${winningBid?.contact_email || ''}
License: ${winningBid?.license_number || 'Per State Requirements'}

PROJECT:
Name: ${project.name}
Address: ${project.address || ''}, ${project.city || ''}, ${project.state || 'AZ'} ${project.zip || ''}
Required Completion: ${project.estimated_completion || 'Per schedule'}

SUBCONTRACT SCOPE:
Trade/Division: ${pkg.name} (CSI Division ${pkg.csi_division || 'N/A'})
Scope: ${pkg.scope_narrative || pkg.name}
${winningBid?.exclusions ? `Exclusions noted by sub: ${winningBid.exclusions}` : ''}

FINANCIAL:
Subcontract Amount: ${amtStr}
Retainage: ${settings?.default_retainage_pct || 10}% until 50% complete, then ${Math.floor((settings?.default_retainage_pct || 10) / 2)}%
Payment Terms: Net ${settings?.default_payment_terms || 30} days after GC receives payment from Owner (Pay-When-Paid)

Write a complete subcontract with these numbered sections:
1. AGREEMENT — parties, project name, contract amount
2. SCOPE OF WORK — detailed scope, what IS included, what is NOT included
3. CONTRACT DOCUMENTS — list of governing documents (drawings, specs, this agreement)
4. CONTRACT PRICE — amount in words and numbers, unit prices if applicable
5. PAYMENT TERMS — schedule, retainage, pay-when-paid clause, lien waiver requirements
6. SCHEDULE — mobilization requirements, milestone dates, liquidated damages
7. INSURANCE REQUIREMENTS — GL $1M/$2M, Workers Comp, Auto, additional insured requirements
8. INDEMNIFICATION — sub indemnifies GC and owner
9. CHANGES — change order process, no work without written authorization
10. WARRANTY — one year minimum, all work and materials
11. TERMINATION — for cause and for convenience provisions
12. DISPUTE RESOLUTION — Arizona law governs, Maricopa County venue
13. SIGNATURES — signature blocks for both parties

Make it legally sound and specific to Arizona construction law.
Use professional legal language but keep it readable.
Include all standard construction subcontract protections.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const subcontractText = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('\n')

    // Store the generated subcontract in project_documents
    const { data: doc } = await db.from('project_documents').insert({
      project_id: pkg.project_id,
      tenant_id: user.tenantId,
      title: `Subcontract — ${pkg.name} — ${winningBid?.company_name || pkg.awarded_to}`,
      document_type: 'contract',
      file_url: '',
      file_path: `subcontracts/${pkg.id}.txt`,
      file_name: `subcontract-${pkg.name.toLowerCase().replace(/\s+/g, '-')}.txt`,
      file_type: 'txt',
      extraction_status: 'complete',
    }).select('id').single()

    return NextResponse.json({
      success: true,
      subcontract_text: subcontractText,
      document_id: doc?.id,
      sub_name: winningBid?.company_name || pkg.awarded_to,
      amount: awardedAmount,
      word_count: subcontractText.split(' ').length,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
