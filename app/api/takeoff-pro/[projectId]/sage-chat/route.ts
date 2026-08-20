import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import Anthropic from '@anthropic-ai/sdk'
import { getLienLaw } from '@/lib/lien-law/states'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

const client = new Anthropic()

// Market data by region (broad ranges that work nationally)
const MARKET_RANGES: Record<string, string> = {
  CA: 'California: Commercial office $280-$420/SF, Retail $160-$260/SF, Industrial $100-$180/SF, Medical $380-$550/SF. High labor costs.',
  NY: 'New York: Commercial office $350-$550/SF, Retail $200-$320/SF, Industrial $120-$200/SF. Very high labor/material costs.',
  TX: 'Texas: Commercial office $140-$220/SF, Retail $100-$160/SF, Industrial $70-$120/SF, Medical $240-$380/SF. Competitive market.',
  FL: 'Florida: Commercial office $160-$240/SF, Retail $120-$180/SF, Industrial $80-$130/SF, Medical $260-$400/SF.',
  AZ: 'Arizona: Commercial office $180-$280/SF, Retail $120-$200/SF, Industrial $80-$140/SF, Medical $280-$450/SF.',
  WA: 'Washington: Commercial office $250-$380/SF, Retail $150-$240/SF, Industrial $90-$160/SF.',
  CO: 'Colorado: Commercial office $200-$320/SF, Retail $130-$210/SF, Industrial $85-$145/SF.',
  IL: 'Illinois: Commercial office $200-$300/SF, Retail $130-$200/SF, Industrial $85-$140/SF.',
  GA: 'Georgia: Commercial office $160-$240/SF, Retail $110-$170/SF, Industrial $75-$125/SF.',
  NC: 'North Carolina: Commercial office $150-$230/SF, Retail $100-$160/SF, Industrial $70-$120/SF.',
  DEFAULT: 'US National: Commercial office $150-$350/SF typical range (varies significantly by metro), Retail $100-$250/SF, Industrial $70-$160/SF, Medical $250-$500/SF.',
}

type ChatContext = {
  project?: string
  projectState?: string
  grandTotal?: number
  costPerSqft?: number
  buildingArea?: number
  confidence?: number
  lineItemCount?: number
  scopeGapCount?: number
  criticalGaps?: string[]
  topDivisions?: string[]
  lowConfidenceItems?: string[]
  excludedCount?: number
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { projectId } = await ctx.params

  const body = (await req.json()) as { message?: string; context?: ChatContext }
  const message = (body.message || '').trim()
  const context = body.context || {}

  if (!message) {
    return NextResponse.json({ error: 'No message' }, { status: 400 })
  }

  const grandTotal = Number(context.grandTotal || 0)
  const costPerSqft = Number(context.costPerSqft || 0)
  const buildingArea = Number(context.buildingArea || 0)
  const confidencePct = Math.round(Number(context.confidence || 0) * 100)

  // Resolve project state dynamically for market + lien law context
  const { data: project } = await supabase
    .from('projects')
    .select('state')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const stateCode = ((project as { state?: string } | null)?.state || context.projectState || 'XX').toUpperCase()
  const marketData = MARKET_RANGES[stateCode] || MARKET_RANGES.DEFAULT
  const law = getLienLaw(stateCode)
  const lienNote = law.preliminaryNoticeRequired
    ? `LIEN LAW NOTE: ${law.stateName} requires preliminary notice within ${law.preliminaryNoticeDays} days of first furnishing (${law.preliminaryNoticeStatute}).`
    : `LIEN LAW NOTE: ${law.stateName} does not require preliminary notice. Mechanic's lien must be filed within ${law.lienFilingDays} days of last work (${law.lienStatute}).`

  const systemPrompt = `You are Sage, an expert AI construction estimator embedded in Saguaro Construction Intelligence Platform.
You are analyzing a specific takeoff for a GC. You have full context of their takeoff data.
Be direct, specific, and actionable. Use construction industry terminology.
Keep responses concise — 2-4 sentences max unless the question requires detail.
Never say "I don't have access to" — you have full context below.
Always give specific dollar amounts or percentages when relevant.

CURRENT TAKEOFF CONTEXT:
Project: ${context.project || 'Unknown'}
Grand Total: $${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
Cost Per SF: $${costPerSqft.toFixed(2)}
Building Area: ${buildingArea.toLocaleString()} SF
AI Confidence: ${confidencePct}%
Line Items: ${context.lineItemCount || 0} active (${context.excludedCount || 0} excluded)
Unresolved Scope Gaps: ${context.scopeGapCount || 0}
Critical Scope Gaps: ${context.criticalGaps?.length ? context.criticalGaps.join(', ') : 'None'}
Top Cost Divisions: ${context.topDivisions?.length ? context.topDivisions.join(' | ') : 'Not calculated yet'}
Low Confidence Items: ${context.lowConfidenceItems?.length ? context.lowConfidenceItems.join(', ') : 'None'}

${law.stateName} construction market context:
${marketData}

${lienNote}`

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    })

    const reply =
      msg.content[0]?.type === 'text' ? msg.content[0].text : 'Unable to process.'
    return NextResponse.json({ reply })
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Sage chat failed' },
      { status: 500 },
    )
  }
}
