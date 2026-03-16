import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { subId, subData } = body;

  const db = createServerClient();
  const tenantId = user.tenantId;

  // Fetch sub data from DB if subId provided
  let sub: Record<string, unknown> = subData || {};
  if (subId) {
    const { data } = await db
      .from('subcontractors')
      .select('*, insurance_certificates(policy_type, expiry_date, status), w9_requests(status, submitted_at), lien_waivers(status, signed_at)')
      .eq('id', subId)
      .eq('tenant_id', tenantId)
      .single();
    if (data) sub = data as Record<string, unknown>;
  }

  const today = new Date().toISOString().split('T')[0];
  const certs = (sub.insurance_certificates as any[]) || [];
  const activeCerts = certs.filter((c: any) => c.expiry_date && c.expiry_date >= today);
  const hasGL = activeCerts.some((c: any) => c.policy_type?.toLowerCase().includes('gl') || c.policy_type?.toLowerCase().includes('general'));
  const hasWC = activeCerts.some((c: any) => c.policy_type?.toLowerCase().includes('wc') || c.policy_type?.toLowerCase().includes('workers'));
  const w9Requests = (sub.w9_requests as any[]) || [];
  const w9Status = w9Requests.find((w: any) => w.status === 'submitted') ? 'submitted' : w9Requests.length > 0 ? 'pending' : 'not_requested';

  const prompt = `You are a construction prequalification expert. Evaluate this subcontractor and provide a pass/flag/fail verdict.

Subcontractor: ${(sub.name as string) || 'Unknown'}
Trade: ${(sub.trade as string) || 'Unknown'}
Contract Amount: $${((sub.contract_amount as number) || 0).toLocaleString()}
License Number: ${(sub.license_number as string) || 'Not provided'}
License Status: ${(sub.license_status as string) || 'Unknown'}
Years in Business: ${(sub.years_in_business as number) || 'Unknown'}
Bonding Capacity: $${((sub.bonding_capacity as number) || 0).toLocaleString()}
References: ${(sub.references as string) || 'Not provided'}

Compliance Status:
- W-9: ${w9Status}
- General Liability Insurance: ${hasGL ? 'Active' : 'Missing/Expired'}
- Workers Compensation: ${hasWC ? 'Active' : 'Missing/Expired'}
- Active insurance certificates: ${activeCerts.length}

Additional notes: ${(sub.notes as string) || 'None'}

Return JSON:
{
  "verdict": "pass" | "flag" | "fail",
  "score": number (0-100),
  "confidence": number (0-100),
  "flags": string[],
  "strengths": string[],
  "required_before_award": string[],
  "summary": string
}

- "pass": Sub meets all requirements and can be awarded work immediately
- "flag": Sub needs follow-up on specific items before award
- "fail": Sub has disqualifying issues

Return only raw JSON.`;

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content?.[0]?.type === 'text' ? (message.content[0] as any).text : '';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    }

    // Optionally store result on sub record
    if (subId) {
      await db.from('subcontractors').update({
        prequal_score: parsed.score,
        prequal_verdict: parsed.verdict,
        prequal_at: new Date().toISOString(),
      }).eq('id', subId).eq('tenant_id', tenantId);
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Rule-based fallback
    const score = (hasGL ? 30 : 0) + (hasWC ? 30 : 0) + (w9Status === 'submitted' ? 20 : 0) + ((sub.license_number as string) ? 20 : 0);
    const flags: string[] = [];
    if (!hasGL) flags.push('General Liability insurance missing');
    if (!hasWC) flags.push('Workers Compensation insurance missing');
    if (w9Status === 'not_requested') flags.push('W-9 not on file');
    return NextResponse.json({
      verdict: score >= 70 ? 'pass' : score >= 40 ? 'flag' : 'fail',
      score,
      confidence: 60,
      flags,
      strengths: [],
      required_before_award: flags,
      summary: `Rule-based analysis (AI unavailable: ${msg}). Compliance score: ${score}/100.`,
    });
  }
}
