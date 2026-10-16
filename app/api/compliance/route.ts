import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';
import { coiStatus, type CoiCertRow } from '@/lib/coi-coverage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  /* Every read below used to be `const { data } = await …` with the error
     dropped on the floor. A failed query became "no subcontractors found", and
     the screen said so with total confidence. Now any failure is a real error
     with a correlation id, and the page says it could not load. */
  try {
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
  const { data: assignments, error: assignErr } = await assignQuery;
  if (assignErr) throw assignErr;

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

  /* Inactive companies stay on file but are not scored. Filtered here rather
     than with .neq('status','inactive'): in PostgREST that also drops every
     row whose status is NULL, and it misses 'Inactive' spelled with a capital —
     the Subs & Vendors list compares case-insensitively, so this does too. */
  let subQuery = db
    .from('subcontractors')
    .select('id, company_name, trade, email, contact_email, status, w9_on_file, insurance_expiry')
    .eq('tenant_id', tenantId)
    .order('company_name', { ascending: true });
  if (projectId) subQuery = subQuery.in('id', [...assignMap.keys()]);
  const { data: allSubs, error: subErr } = await subQuery;
  if (subErr) throw subErr;
  const subs = (allSubs || []).filter((s) => String((s as { status?: string | null }).status || '').trim().toLowerCase() !== 'inactive');

  if (!subs || subs.length === 0) {
    return NextResponse.json({ subs: [], summary: { total: 0, compliant: 0, at_risk: 0, non_compliant: 0, avg_score: null } });
  }

  // Current / expiring on the company's day (device, else company zone) — not the server's UTC day.
  const { today } = await requestDay(req.headers, db, tenantId, 'compliance');
  const subIds = subs.map((s: any) => s.id);

  // Fetch all insurance certificates for these subs
  // Every coverage column (lib/coi-coverage COI_CERT_COLUMNS), not just policy_type + expiry_date.
  const { data: certs, error: certErr } = await db
    .from('insurance_certificates')
    .select('sub_id, policy_type, expiry_date, gl_expiry, wc_expiry, auto_expiry, umbrella_expiry, status')
    .eq('tenant_id', tenantId)
    .in('sub_id', subIds);
  if (certErr) throw certErr;

  // Fetch all lien waivers for these subs
  const { data: waivers, error: waiverErr } = await db
    .from('lien_waivers')
    .select('subcontractor_id, status, signed_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('subcontractor_id', subIds);
  if (waiverErr) throw waiverErr;

  // w9_requests has no subcontractor foreign key at all — a request is raised
  // against a vendor_email, because a W-9 goes out to whoever is getting paid,
  // sub or not. Email is the only join there is.
  const emailOf = (s: any) => String(s.email || s.contact_email || '').trim().toLowerCase();
  const subEmails = (subs as any[]).map(emailOf).filter(Boolean);
  const { data: w9s, error: w9Err } = subEmails.length
    ? await db
        .from('w9_requests')
        .select('vendor_email, status, submitted_at')
        .eq('tenant_id', tenantId)
        .in('vendor_email', subEmails)
    : { data: [] as any[], error: null };
  if (w9Err) throw w9Err;

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
    const w9 = w9Map.get(emailOf(sub));

    // W-9 status (25 points). subcontractors carries a w9_on_file boolean; the
    // request lifecycle (pending / submitted) lives in w9_requests.
    const w9Status = sub.w9_on_file === true ? 'approved' : (w9?.status || 'not_requested');
    const w9Score = w9Status === 'submitted' || w9Status === 'approved' ? 25 : w9Status === 'pending' ? 10 : 0;

    // Insurance status (40 points) — current GL and WC, read from every
    // coverage on the certificate (an ACORD 25 carries both on one row).
    const coi = coiStatus(subCerts as CoiCertRow[], today, sub.insurance_expiry);
    const hasGL = coi.hasGL;
    const hasWC = coi.hasWC;
    const insScore = (hasGL ? 20 : 0) + (hasWC ? 20 : 0) - (coi.expiringCerts > 0 ? 5 : 0);

    // Lien waiver status (35 points)
    const totalWaivers = subWaivers.length;
    const signedWaivers = subWaivers.filter((w: any) => w.signed_at || w.status === 'signed').length;
    const waiverScore = totalWaivers === 0 ? 25 : Math.round((signedWaivers / totalWaivers) * 35);

    const score = Math.max(0, Math.min(100, w9Score + insScore + waiverScore));
    /* No current liability coverage is not a points problem, it is a hold: the
       award gate refuses that sub, so the scorecard must not call them "at
       risk" while a W-9 and signed waivers carry the score to 60. */
    const compliance = !hasGL ? 'non_compliant' : score >= 80 ? 'compliant' : score >= 50 ? 'at_risk' : 'non_compliant';

    const assigned = assignMap.get(sub.id);

    return {
      id: sub.id,
      name: sub.company_name,
      trade: sub.trade,
      email: sub.email || sub.contact_email || null,
      contract_amount: assigned?.contract || 0,
      project_id: projectId || assigned?.projects[0] || null,
      project_ids: assigned?.projects || [],
      score,
      compliance,
      w9: { status: w9Status, score: w9Score },
      insurance: {
        active_certs: coi.activeCerts || (hasGL ? 1 : 0),
        expiring_certs: coi.expiringCerts,
        soonest_expiry: coi.soonestExpiry,
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
  } catch (e) {
    return apiError('compliance', e, "Couldn't load compliance. Please try again.");
  }
}
