import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    // Load bid package
    const { data: pkg, error: pkgErr } = await db
      .from('bid_packages')
      .select('name, trade, csi_division, estimated_value, work_included, work_excluded, scope_of_work')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (pkgErr || !pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });

    // Load all submissions
    const { data: subs, error: subsErr } = await db
      .from('bid_submissions')
      .select('id, company_name, base_bid, base_amount, exclusions, inclusions, clarifications, status')
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId)
      .order('base_bid', { ascending: true });
    if (subsErr) throw subsErr;
    if (!subs || subs.length === 0) return NextResponse.json({ error: 'No bids to analyze' }, { status: 400 });

    const bidSummaries = subs.map((s: Record<string, unknown>, i: number) => {
      const bid = (s.base_bid as number) || (s.base_amount as number) || 0;
      return `${i + 1}. ${s.company_name}: $${bid.toLocaleString()} | Exclusions: ${s.exclusions || 'None'} | Clarifications: ${s.clarifications || 'None'}`;
    }).join('\n');

    const prompt = `You are a senior construction estimator performing bid leveling on ${subs.length} subcontractor bids.

BID PACKAGE: ${pkg.name}
TRADE: ${pkg.trade || 'Not specified'}
CSI DIVISION: ${pkg.csi_division || 'Not specified'}
ENGINEER'S ESTIMATE: $${(pkg.estimated_value || 0).toLocaleString()}
SCOPE INCLUDES: ${Array.isArray(pkg.work_included) ? pkg.work_included.join(', ') : pkg.work_included || 'Not specified'}
SCOPE EXCLUDES: ${Array.isArray(pkg.work_excluded) ? pkg.work_excluded.join(', ') : pkg.work_excluded || 'Not specified'}

BIDS RECEIVED (ranked low to high):
${bidSummaries}

Analyze all bids together. Respond with JSON only:
{
  "spread_analysis": "One paragraph analyzing the bid spread and what it indicates",
  "scope_gaps": "Identify scope gaps between submissions — what some included that others excluded",
  "outlier_flags": "Flag any outlier bids (too high or suspiciously low) with explanation",
  "recommendation": "Which bid to award and why, considering price, scope completeness, and risk",
  "leveling_notes": "Bullet-point summary suitable for the bid leveling record"
}`;

    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    let analysis: Record<string, unknown>;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
    } catch {
      analysis = {
        spread_analysis: text,
        scope_gaps: '',
        outlier_flags: '',
        recommendation: '',
        leveling_notes: '',
      };
    }

    // Save to bid package
    await db.from('bid_packages')
      .update({ sage_leveling_notes: JSON.stringify(analysis) })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    return NextResponse.json({ data: analysis });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    console.error('[bid-packages/analyze-bids]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
