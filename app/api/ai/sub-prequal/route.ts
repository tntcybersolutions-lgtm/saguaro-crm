import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { tryWrite } from '@/lib/db-write';
import { requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { subId, subData } = body;

  const db = createServerClient();
  const tenantId = user.tenantId;

  /* The subcontractor's own record and its insurance certificates (one FK,
     insurance_certificates.sub_id). This used to embed w9_requests (no FK to
     subcontractors at all) and lien_waivers (two FKs, sub_id and
     subcontractor_id): PostgREST refused the whole select every time, the
     error was dropped, and the AI scored whatever the page sent instead. */
  let sub: Record<string, unknown> = subData || {};
  let onFile = false;
  let w9Status: 'submitted' | 'pending' | 'not_requested' = 'not_requested';
  // Only a real subcontractors id is looked up (the compliance roster can carry a project-only row).
  if (typeof subId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subId)) {
    const { data, error } = await db
      .from('subcontractors')
      .select('*, insurance_certificates(policy_type, expiry_date, status, gl_expiry, wc_expiry)')
      .eq('id', subId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) return apiError('ai/sub-prequal read', error, "Couldn't read this subcontractor's file. Please try again.");
    if (data) {
      onFile = true;
      sub = { ...sub, ...(data as Record<string, unknown>), name: (data as any).company_name || (sub as any).name };
      // A W-9 is on the sub's record, or was asked for by email (w9_requests has no sub link).
      if ((data as any).w9_on_file) w9Status = 'submitted';
      else {
        const emails = [(data as any).email, (data as any).contact_email].filter((e): e is string => !!e);
        if (emails.length) {
          const { data: reqs, error: wErr } = await db.from('w9_requests').select('status').eq('tenant_id', tenantId).in('vendor_email', emails);
          if (wErr) return apiError('ai/sub-prequal w9', wErr, "Couldn't read this subcontractor's W-9 requests. Please try again.");
          w9Status = (reqs || []).some((w: any) => ['submitted', 'approved', 'received', 'completed'].includes(String(w.status))) ? 'submitted' : (reqs || []).length ? 'pending' : 'not_requested';
        }
      }
    }
  }
  if (!onFile) {
    const w = String((sub as any).w9_status || '');
    w9Status = w === 'on_file' || w === 'submitted' ? 'submitted' : w === 'pending' ? 'pending' : 'not_requested';
  }

  // Active certs are judged on the company's day (device, else company zone), not UTC's.
  let today: string;
  try {
    ({ today } = await requestDay(req.headers, db, tenantId, 'ai/sub-prequal'));
  } catch (e) {
    return apiError('ai/sub-prequal', e);
  }
  const certs = (sub.insurance_certificates as any[]) || [];
  const live = (d: unknown) => typeof d === 'string' && d >= today;
  const hasGL = certs.some((c: any) => live(c.gl_expiry) || (live(c.expiry_date) && /\bgl\b|general/i.test(String(c.policy_type || ''))))
    || (!onFile && (sub as any).coi_status === 'active');
  const hasWC = certs.some((c: any) => live(c.wc_expiry) || (live(c.expiry_date) && /\bwc\b|workers/i.test(String(c.policy_type || ''))));
  const activeCerts = certs.filter((c: any) => live(c.expiry_date) || live(c.gl_expiry) || live(c.wc_expiry));
  const licenseExpiry = (sub.license_expiration || sub.license_expiry) as string | undefined;

  const prompt = `You are a construction prequalification expert. Evaluate this subcontractor and provide a pass/flag/fail verdict.

Subcontractor: ${(sub.name as string) || 'Unknown'}
Trade: ${(sub.trade as string) || 'Unknown'}
Contract Amount: $${((sub.contract_amount as number) || (sub.total_awarded as number) || 0).toLocaleString()}
License Number: ${(sub.license_number as string) || 'Not provided'}
License Status: ${licenseExpiry ? (licenseExpiry >= today ? `Valid through ${licenseExpiry}` : `Expired ${licenseExpiry}`) : (sub.license_status as string) || 'Unknown'}
Bonding Capacity: $${((sub.bonding_capacity as number) || 0).toLocaleString()}
Projects Completed: ${(sub.projects_completed as number) ?? 'Unknown'}
On-Time Completion: ${sub.on_time_completion_pct != null ? `${sub.on_time_completion_pct}%` : 'Unknown'}

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

    // Store the result on the sub's own record (only when it was read from it).
    if (subId && onFile) {
      await tryWrite(db.from('subcontractors').update({
        prequal_score: parsed.score as number | null,
        prequal_verdict: parsed.verdict as string | null,
        prequal_at: new Date().toISOString(),
      }).eq('id', subId).eq('tenant_id', tenantId), 'subcontractors update');
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = 'Internal server error';
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
