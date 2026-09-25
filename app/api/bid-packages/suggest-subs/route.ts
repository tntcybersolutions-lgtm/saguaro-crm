import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { recordLearning } from '@/lib/learning';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const trade = searchParams.get('trade') || '';
  const projectId = searchParams.get('projectId') || '';

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const tenantId = user.tenantId;
    const db = createServerClient();

    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    // subcontractors are tenant-scoped (linked to projects via project_subcontractors),
    // so there's no projects.project_id filter; allTenantSubs is the full candidate
    // pool for the trade (the old projectSubs query was a broken, redundant subset).
    // USAGE HISTORY is the primary ranking signal ("the top 2 subs YOU use for
    // this trade"), from real memberships + awarded contracts — not generic scores.
    const [{ data: performance }, { data: allTenantSubs }, { data: memberships }, { data: awarded }] = await Promise.all([
      db.from('sub_performance')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('trade', `%${trade}%`)
        .order('win_rate', { ascending: false })
        .limit(20),
      db.from('subcontractors')
        .select('id, company_name, email, phone, trade, rating, w9_on_file')
        .eq('tenant_id', tenantId)
        .neq('status', 'inactive')
        .ilike('trade', `%${trade}%`)
        .limit(50),
      db.from('project_subcontractors')
        .select('subcontractor_id, contract_amount, created_at')
        .eq('tenant_id', tenantId),
      db.from('bid_submissions')
        .select('sub_id, awarded_at, amount')
        .eq('tenant_id', tenantId)
        .eq('is_awarded', true),
    ]);

    // Usage rollup per sub: projects together, dollars awarded, most recent work.
    const usage = new Map<string, { projects: number; dollars: number; last: string }>();
    const bump = (id: any, dollars: number, when: any) => {
      if (!id) return;
      const u = usage.get(id) || { projects: 0, dollars: 0, last: '' };
      u.projects += 1;
      u.dollars += Number(dollars) || 0;
      const w = String(when || '');
      if (w > u.last) u.last = w;
      usage.set(id, u);
    };
    for (const m of (memberships || [])) bump((m as any).subcontractor_id, (m as any).contract_amount, (m as any).created_at);
    for (const a of (awarded || [])) bump((a as any).sub_id, (a as any).amount, (a as any).awarded_at);

    // Fetch insurance certs for compliance scoring
    const subIds = (allTenantSubs || []).map((s: any) => s.id);
    const { data: certs } = subIds.length > 0
      ? await db.from('insurance_certificates').select('sub_id, expiry_date, policy_type').eq('tenant_id', tenantId).in('sub_id', subIds)
      : { data: [] };

    const certMap = new Map<string, any[]>();
    for (const cert of (certs || [])) {
      const id = (cert as any).subcontractor_id;
      if (!certMap.has(id)) certMap.set(id, []);
      certMap.get(id)!.push(cert);
    }

    const perfMap = new Map<string, any>();
    (performance || []).forEach((p: any) => { if (p.sub_id) perfMap.set(p.sub_id, p); });

    // Merge project subs + all tenant subs, dedupe by email
    const merged = new Map<string, any>();
    for (const s of (allTenantSubs || [])) {
      if (s.email && !merged.has(s.email)) merged.set(s.email, s);
      else if (!s.email && !merged.has(s.id)) merged.set(s.id, s);
    }

    const results = Array.from(merged.values()).map((s: any) => {
      const perf = perfMap.get(s.id);
      const subCerts = certMap.get(s.id) || [];
      const activeCerts = subCerts.filter((c: any) => c.expiry_date && c.expiry_date >= today);
      const expiringCerts = activeCerts.filter((c: any) => c.expiry_date <= in30);
      const hasGL = activeCerts.some((c: any) => c.policy_type?.toLowerCase().includes('gl') || c.policy_type?.toLowerCase().includes('general'));
      const hasWC = activeCerts.some((c: any) => c.policy_type?.toLowerCase().includes('wc') || c.policy_type?.toLowerCase().includes('workers'));
      const w9Ok = s.w9_on_file === true;

      // Compliance flags
      const complianceFlags: string[] = [];
      if (!w9Ok) complianceFlags.push('W-9 not on file');
      if (!hasGL) complianceFlags.push('GL insurance missing');
      if (!hasWC) complianceFlags.push('Workers Comp missing');
      if (expiringCerts.length > 0) complianceFlags.push(`${expiringCerts.length} cert(s) expiring soon`);

      const complianceScore = (w9Ok ? 25 : 0) + (hasGL ? 20 : 0) + (hasWC ? 20 : 0) - (expiringCerts.length > 0 ? 5 : 0);
      const winRate = perf?.win_rate || 0;

      // USAGE-FIRST ranking: the subs this GC actually works with outrank
      // everything; compliance + win rate break ties among the unused pool.
      const u = usage.get(s.id) || { projects: 0, dollars: 0, last: '' };
      const usageScore = Math.min(60, u.projects * 15) + Math.min(20, Math.log10(1 + u.dollars) * 3);
      const recScore = Math.round(usageScore + complianceScore * 0.2 + Math.min(winRate, 100) * 0.2);

      const reasons: string[] = [];
      if (u.projects > 0) reasons.push(`${u.projects} project${u.projects === 1 ? '' : 's'} together`);
      if (u.dollars > 0) reasons.push(`$${Math.round(u.dollars).toLocaleString()} awarded`);
      if (u.projects === 0 && perf?.invite_count > 0) reasons.push(`Invited ${perf.invite_count}x before`);
      if (u.projects === 0 && winRate > 0) reasons.push(`${winRate}% win rate`);
      if (complianceScore >= 55) reasons.push('Good compliance standing');

      return {
        id: s.id,
        name: s.company_name,
        email: s.email,
        phone: s.phone,
        trade: s.trade,
        winRate,
        projectsTogether: u.projects,
        dollarsAwarded: Math.round(u.dollars),
        lastWorked: u.last ? u.last.slice(0, 10) : '',
        lastProject: perf?.last_project || '',
        lastProjectDate: perf?.last_project_date || '',
        inviteCount: perf?.invite_count || 0,
        rating: s.rating || perf?.avg_rating || 0,
        complianceScore: Math.max(0, Math.min(100, complianceScore)),
        complianceFlags,
        recScore,
        suggestedReason: reasons.length > 0 ? reasons.join(' · ') : 'Available in your network',
        preChecked: recScore >= 50 && complianceFlags.length === 0,
      };
    }).sort((a, b) => b.recScore - a.recScore).slice(0, 20);

    // Top picks = your go-to subs for this trade (worked together before);
    // the rest are the choose-from-others pool.
    const topPicks = results.filter((r) => r.projectsTogether > 0).slice(0, 2);
    if (topPicks.length > 0) recordLearning(db, { tenantId, kind: 'sub_suggested', projectId: projectId || null, userId: user.id, meta: { trade, top: topPicks.map((t) => t.name) } });
    const topIds = new Set(topPicks.map((t) => t.id));
    return NextResponse.json({ subs: results, topPicks, others: results.filter((r) => !topIds.has(r.id)) });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no subcontractors" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('bid-packages/suggest-subs', e, 'Could not load subcontractors');
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
