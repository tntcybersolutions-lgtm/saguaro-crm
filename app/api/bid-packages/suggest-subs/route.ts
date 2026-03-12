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

    const [{ data: performance }, { data: projectSubs }] = await Promise.all([
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
    ]);

    const perfMap = new Map<string, any>();
    (performance || []).forEach((p: any) => { if (p.sub_id) perfMap.set(p.sub_id, p); });

    const allSubs = [...(projectSubs || [])];
    const seen = new Set<string>();
    const results = allSubs
      .filter(s => { if (seen.has(s.email)) return false; seen.add(s.email); return true; })
      .map((s: any) => {
        const perf = perfMap.get(s.id);
        return {
          id: s.id,
          name: s.name,
          email: s.email,
          phone: s.phone,
          trade: s.trade,
          winRate: perf?.win_rate || 0,
          lastProject: perf?.last_project || '',
          lastProjectDate: perf?.last_project_date || '',
          inviteCount: perf?.invite_count || 0,
          rating: s.rating || perf?.avg_rating || 0,
          suggestedReason: perf ? 'Previously used' : 'On project',
          preChecked: (perf?.invite_count || 0) > 0 || (perf?.win_rate || 0) > 60,
        };
      });

    return NextResponse.json({ subs: results });
  } catch (err: any) {
    return NextResponse.json({ subs: [], error: err.message });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
