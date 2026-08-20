import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    // Load submission
    const { data: sub, error: subErr } = await db
      .from('bid_submissions')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (subErr || !sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    // Load bid package with scope details
    const { data: pkg, error: pkgErr } = await db
      .from('bid_packages')
      .select('name, trade, csi_division, estimated_value, work_included, work_excluded, scope_of_work')
      .eq('id', sub.bid_package_id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (pkgErr || !pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });

    const prompt = `You are a senior construction estimator reviewing a subcontractor bid.

BID PACKAGE: ${pkg.name}
TRADE: ${pkg.trade || 'Not specified'}
CSI DIVISION: ${pkg.csi_division || 'Not specified'}
ENGINEER'S ESTIMATE: $${(pkg.estimated_value || 0).toLocaleString()}
SCOPE INCLUDES: ${Array.isArray(pkg.work_included) ? pkg.work_included.join(', ') : pkg.work_included || 'Not specified'}
SCOPE EXCLUDES: ${Array.isArray(pkg.work_excluded) ? pkg.work_excluded.join(', ') : pkg.work_excluded || 'Not specified'}
SCOPE OF WORK: ${pkg.scope_of_work || 'Not specified'}

SUBCONTRACTOR BID:
Company: ${sub.company_name}
Base Bid: $${(sub.base_bid || sub.base_amount || 0).toLocaleString()}
Exclusions stated: ${sub.exclusions || 'None stated'}
Inclusions stated: ${sub.inclusions || 'None stated'}
Clarifications: ${sub.clarifications || 'None'}

Analyze this bid in 3 short paragraphs:
1. Price analysis: is this bid reasonable vs estimate? Flag if >15% over or <20% under.
2. Scope gaps: what might this sub have excluded that is required?
3. Risk assessment: what is the risk of awarding to this sub? Rate 1-10.

Respond with JSON only:
{
  "price_analysis": "string",
  "scope_gaps": "string",
  "risk_assessment": "string",
  "risk_score": number,
  "recommendation": "award" | "shortlist" | "clarify" | "reject",
  "adjusted_amount_suggestion": number | null
}`;

    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON from response (handle markdown code blocks)
    let analysis: Record<string, unknown>;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
    } catch {
      analysis = {
        price_analysis: text,
        scope_gaps: '',
        risk_assessment: '',
        risk_score: 5,
        recommendation: 'clarify',
        adjusted_amount_suggestion: null,
      };
    }

    // Save analysis to submission
    await db
      .from('bid_submissions')
      .update({
        sage_analysis: JSON.stringify(analysis),
        risk_score: typeof analysis.risk_score === 'number' ? analysis.risk_score : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    return NextResponse.json({ data: analysis });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    console.error('[bid-submissions/analyze]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
