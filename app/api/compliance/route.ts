import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { addDays, requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const tenantId = user.tenantId;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || undefined;

  // A subcontractor belongs to the tenant, not to a project — one sub works a
  // dozen jobs. The project link and the contract value live on the join table
  // project_subcontractors. This route used to select contract_amount,
  // project_id and w9_status straight off subcontractors; none of the three
  // exist there, so PostgREST rejected the whole query and the compliance
  // dashboard returned an error every single time it loaded.
  let assignQuery = db
    .from('project_subcontractors')
    .select('subcontractor_id, project_id, contract_amount, is_compliant, status')
    .eq('tenant_id', tenantId);
  if (projectId) assignQuery = assignQuery.eq('project_id', projectId);
  const { data: assignments } = await assignQuery;

  // subId -> { contract total across the projects in scope, the projects }
  const assignMap = new Map<string, { contract: number; projects: string[] }>();
  for (const a of (assignments || []) as any[]) {
    if (!a.subcontractor_id) continue;
    const cur = assignMap.get(a.subcontractor_id) || { contract: 0, projects: [] };
    cur.contract += Number(a.contract_amount) || 0;
    if (a.project_id && !cur.projects.includes(a.project_id)) cur.projects.push(a.project_id);
    assignMap.set(a.subcontractor_id, cur);
  }

  // Scoped to a project? Then only the subs actually assigned to it. No
  // assignments means no subs — not "every sub in the tenant", which is what an
  // unfiltered fallback would have shown on a project with nobody on it yet.
  if (projectId && assignMap.size === 0) {
    return NextResponse.json({ subs: [], summary: { total: 0, compliant: 0, at_risk: 0, non_compliant: 0, avg_score: null } });
  }

  let subQuery = db
    .from('subcontractors')
    .select('id, company_name, trade, email, status, w9_on_file')
    .eq('tenant_id', tenantId)
    .neq('status', 'inactive')
    .order('company_name', { ascending: true });
  if (projectId) subQuery = subQuery.in('id', [...assignMap.keys()]);
  const { data: subs } = await subQuery;

  if (!subs || subs.length === 0) {
    return NextResponse.json({ subs: [], summary: { total: 0, compliant: 0, at_risk: 0, non_compliant: 0, avg_score: null } });
  }

  // Current / expiring on the company's day (device, else company zone) — not the server's UTC day.
  let today: string;
  try {
    ({ today } = await requestDay(req.headers, db, tenantId, 'compliance'));
  } catch (e) {
    return apiError('compliance', e, "Couldn't load compliance.");
  }
  const in30 = addDays(today, 30);
  const subIds = subs.map((s: any) => s.id);

  // Fetch all insurance certificates for these subs
  const { data: certs } = await db
    .from('insurance_certificates')
    .select('sub_id, policy_type, expiry_date, status')
    .eq('tenant_id', tenantId)
    .in('sub_id', subIds);

  // Fetch all lien waivers for these subs
  const { data: waivers } = await db
    .from('lien_waivers')
    .select('subcontractor_id, status, signed_at')
    .eq('tenant_id', tenantId)
    .in('subcontractor_id', subIds);

  // w9_requests has no subcontractor foreign key at all — a request is raised
  // against a vendor_email, because a W-9 goes out to whoever is getting paid,
  // sub or not. Email is the only join there is.
  const subEmails = (subs as any[]).map((s) => (s.email || '').toLowerCase()).filter(Boolean);
  const { data: w9s } = subEmails.length
    ? await db
        .from('w9_requests')
        .select('vendor_email, status, submitted_at')
        .eq('tenant_id', tenantId)
        .in('vendor_email', subEmails)
    : { data: [] as any[] };

  const certMap = new Map<string, any[]>();
  const waiverMap = new Map<string, any[]>();
  const w9Map = new Map<string, any>();

  // insurance_certificates keys the sub as sub_id, not subcontractor_id. Reading
  // the wrong property bucketed every certificate under `undefined`, so the
  // insurance half of the score — 40 of the 100 points — was always zero.
  for (const cert of (certs || [])) {
    const id = (cert as any).sub_id;
    if (!certMap.has(id)) certMap.set(id, []);
    certMap.get(id)!.push(cert);
  }
  for (const w of (waivers || [])) {
    const id = (w as any).subcontractor_id;
    if (!waiverMap.has(id)) waiverMap.set(id, []);
    waiverMap.get(id)!.push(w);
  }
  // Keyed by email, and a submitted request always wins over an older pending one.
  for (const w9 of (w9s || [])) {
    const key = ((w9 as any).vendor_email || '').toLowerCase();
    if (!key) continue;
    if (!w9Map.has(key) || (w9 as any).submitted_at) w9Map.set(key, w9);
  }

  const scoredSubs = (subs as any[]).map((sub) => {
    const subCerts = certMap.get(sub.id) || [];
    const subWaivers = waiverMap.get(sub.id) || [];
    const w9 = w9Map.get((sub.email || '').toLowerCase());

    // W-9 status (25 points). subcontractors carries a w9_on_file boolean; the
    // request lifecycle (pending / submitted) lives in w9_requests.
    const w9Status = sub.w9_on_file === true ? 'approved' : (w9?.status || 'not_requested');
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

    const assigned = assignMap.get(sub.id);

    return {
      id: sub.id,
      name: sub.company_name,
      trade: sub.trade,
      email: sub.email,
      contract_amount: assigned?.contract || 0,
      project_id: projectId || assigned?.projects[0] || null,
      project_ids: assigned?.projects || [],
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
    avg_score: scoredSubs.length > 0 ? Math.round(scoredSubs.reduce((s, sub) => s + sub.score, 0) / scoredSubs.length) : null,
  };

  return NextResponse.json({ subs: scoredSubs, summary });
}
