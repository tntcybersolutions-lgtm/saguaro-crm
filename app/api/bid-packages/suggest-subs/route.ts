import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

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

    const [{ data: performance }, { data: projectSubs }, { data: allTenantSubs }] = await Promise.all([
      db.from('sub_performance')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('trade', `%${trade}%`)
        .order('win_rate', { ascending: false })
        .limit(20),
      db.from('subcontractors')
        .select('*')
        .eq('project_id', projectId)
        .ilike('trade', `%${trade}%`),
      db.from('subcontractors')
        .select('id, name, email, phone, trade, rating, w9_status')
        .eq('tenant_id', tenantId)
        .neq('status', 'inactive')
        .ilike('trade', `%${trade}%`)
        .limit(50),
    ]);

    // Fetch insurance certs for compliance scoring
    const subIds = (allTenantSubs || []).map((s: any) => s.id);
    const { data: certs } = subIds.length > 0
      ? await db.from('insurance_certificates').select('subcontractor_id, expiry_date, policy_type').eq('tenant_id', tenantId).in('subcontractor_id', subIds)
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
    for (const s of [...(allTenantSubs || []), ...(projectSubs || [])]) {
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
      const w9Ok = s.w9_status === 'submitted' || s.w9_status === 'approved';

      // Compliance flags
      const complianceFlags: string[] = [];
      if (!w9Ok) complianceFlags.push('W-9 not on file');
      if (!hasGL) complianceFlags.push('GL insurance missing');
      if (!hasWC) complianceFlags.push('Workers Comp missing');
      if (expiringCerts.length > 0) complianceFlags.push(`${expiringCerts.length} cert(s) expiring soon`);

      const complianceScore = (w9Ok ? 25 : 0) + (hasGL ? 20 : 0) + (hasWC ? 20 : 0) - (expiringCerts.length > 0 ? 5 : 0);
      const winRate = perf?.win_rate || 0;

      // Composite recommendation score (0-100)
      const recScore = Math.round(complianceScore * 0.4 + Math.min(winRate, 100) * 0.4 + ((perf?.invite_count || 0) > 0 ? 20 : 0));

      const reasons: string[] = [];
      if (perf?.invite_count > 0) reasons.push(`Invited ${perf.invite_count}x before`);
      if (winRate > 0) reasons.push(`${winRate}% win rate`);
      if (complianceScore >= 55) reasons.push('Good compliance standing');

      return {
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        trade: s.trade,
        winRate,
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

    return NextResponse.json({ subs: results });
  } catch (err: any) {
    return NextResponse.json({ subs: [], error: err.message });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
