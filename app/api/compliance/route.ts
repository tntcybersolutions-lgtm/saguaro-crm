import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const tenantId = user.tenantId;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || undefined;

  // Fetch all active subcontractors
  let subQuery = db
    .from('subcontractors')
    .select('id, name, trade, email, contract_amount, project_id, w9_status, status')
    .eq('tenant_id', tenantId)
    .neq('status', 'inactive')
    .order('name', { ascending: true });
  if (projectId) subQuery = subQuery.eq('project_id', projectId);
  const { data: subs } = await subQuery;

  if (!subs || subs.length === 0) {
    return NextResponse.json({ subs: [], summary: { total: 0, compliant: 0, at_risk: 0, non_compliant: 0 } });
  }

  const today = new Date().toISOString().split('T')[0];
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const subIds = subs.map((s: any) => s.id);

  // Fetch all insurance certificates for these subs
  const { data: certs } = await db
    .from('insurance_certificates')
    .select('subcontractor_id, policy_type, expiry_date, status')
    .eq('tenant_id', tenantId)
    .in('subcontractor_id', subIds);

  // Fetch all lien waivers for these subs
  const { data: waivers } = await db
    .from('lien_waivers')
    .select('subcontractor_id, status, signed_at')
    .eq('tenant_id', tenantId)
    .in('subcontractor_id', subIds);

  // Fetch W9 requests
  const { data: w9s } = await db
    .from('w9_requests')
    .select('sub_id, status, submitted_at')
    .eq('tenant_id', tenantId)
    .in('sub_id', subIds);

  const certMap = new Map<string, any[]>();
  const waiverMap = new Map<string, any[]>();
  const w9Map = new Map<string, any>();

  for (const cert of (certs || [])) {
    const id = (cert as any).subcontractor_id;
    if (!certMap.has(id)) certMap.set(id, []);
    certMap.get(id)!.push(cert);
  }
  for (const w of (waivers || [])) {
    const id = (w as any).subcontractor_id;
    if (!waiverMap.has(id)) waiverMap.set(id, []);
    waiverMap.get(id)!.push(w);
  }
  for (const w9 of (w9s || [])) {
    const id = (w9 as any).sub_id;
    if (!w9Map.has(id) || (w9 as any).submitted_at) w9Map.set(id, w9);
  }

  const scoredSubs = (subs as any[]).map((sub) => {
    const subCerts = certMap.get(sub.id) || [];
    const subWaivers = waiverMap.get(sub.id) || [];
    const w9 = w9Map.get(sub.id);

    // W-9 status (25 points)
    const w9Status = sub.w9_status || w9?.status || 'not_requested';
    const w9Score = w9Status === 'submitted' || w9Status === 'approved' ? 25 : w9Status === 'pending' ? 10 : 0;

    // Insurance status (40 points) — check for active GL and WC certs
    const activeCerts = subCerts.filter((c: any) => c.expiry_date && c.expiry_date >= today);
    const expiringCerts = subCerts.filter((c: any) => c.expiry_date && c.expiry_date >= today && c.expiry_date <= in30);
    const hasGL = activeCerts.some((c: any) => c.policy_type?.toLowerCase().includes('gl') || c.policy_type?.toLowerCase().includes('general'));
    const hasWC = activeCerts.some((c: any) => c.policy_type?.toLowerCase().includes('wc') || c.policy_type?.toLowerCase().includes('workers'));
    const insScore = (hasGL ? 20 : 0) + (hasWC ? 20 : 0) - (expiringCerts.length > 0 ? 5 : 0);

    // Lien waiver status (35 points)
    const totalWaivers = subWaivers.length;
    const signedWaivers = subWaivers.filter((w: any) => w.signed_at || w.status === 'signed').length;
    const waiverScore = totalWaivers === 0 ? 25 : Math.round((signedWaivers / totalWaivers) * 35);

    const score = Math.max(0, Math.min(100, w9Score + insScore + waiverScore));
    const compliance = score >= 80 ? 'compliant' : score >= 50 ? 'at_risk' : 'non_compliant';

    return {
      id: sub.id,
      name: sub.name,
      trade: sub.trade,
      email: sub.email,
      contract_amount: sub.contract_amount || 0,
      project_id: sub.project_id,
      score,
      compliance,
      w9: { status: w9Status, score: w9Score },
      insurance: {
        active_certs: activeCerts.length,
        expiring_certs: expiringCerts.length,
        has_gl: hasGL,
        has_wc: hasWC,
        score: Math.max(0, insScore),
      },
      lien_waivers: {
        total: totalWaivers,
        signed: signedWaivers,
        pending: totalWaivers - signedWaivers,
        score: waiverScore,
      },
    };
  });

  const summary = {
    total: scoredSubs.length,
    compliant: scoredSubs.filter(s => s.compliance === 'compliant').length,
    at_risk: scoredSubs.filter(s => s.compliance === 'at_risk').length,
    non_compliant: scoredSubs.filter(s => s.compliance === 'non_compliant').length,
    avg_score: scoredSubs.length > 0 ? Math.round(scoredSubs.reduce((s, sub) => s + sub.score, 0) / scoredSubs.length) : 0,
  };

  return NextResponse.json({ subs: scoredSubs, summary });
}
