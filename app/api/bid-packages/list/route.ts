import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ bidPackages: [] }, { status: 401 });

    const db = createServerClient();
    let query = db
      .from('bid_packages')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];

    // Leveling aggregates (invited / responded / low bid / spread) ride on the
    // list payload — grouped from the invites + submissions tables in two
    // set-based reads, replacing the client's former per-package detail N+1.
    const ids = rows.map((p: any) => p.id).filter(Boolean);
    if (ids.length) {
      const [{ data: invites }, { data: submissions }] = await Promise.all([
        db.from('bid_package_invites').select('bid_package_id').eq('tenant_id', user.tenantId).in('bid_package_id', ids),
        db.from('bid_submissions').select('*').eq('tenant_id', user.tenantId).in('bid_package_id', ids),
      ]);
      const invitedBy: Record<string, number> = {};
      for (const inv of (invites || []) as any[]) {
        if (inv.bid_package_id) invitedBy[inv.bid_package_id] = (invitedBy[inv.bid_package_id] || 0) + 1;
      }
      const subsBy: Record<string, { amt: number; who: string }[]> = {};
      for (const s of (submissions || []) as any[]) {
        if (!s.bid_package_id || String(s.status || '').toLowerCase() === 'withdrawn') continue;
        const amt = Number(s.amount ?? s.base_amount ?? s.total_amount) || 0;
        (subsBy[s.bid_package_id] = subsBy[s.bid_package_id] || []).push({ amt, who: s.company_name || s.sub_name || s.contact_name || '' });
      }
      for (const pkg of rows as any[]) {
        const subs = subsBy[pkg.id] || [];
        const amts = subs.filter(a => a.amt > 0).sort((a, b) => a.amt - b.amt);
        const low = amts[0] || null;
        const high = amts.length ? amts[amts.length - 1] : null;
        pkg.leveling = {
          invited: Number(invitedBy[pkg.id]) || 0,
          responded: subs.length,
          low: low ? low.amt : null,
          lowWho: low ? low.who : null,
          spread: low && high && amts.length >= 2 && low.amt > 0 ? ((high.amt - low.amt) / low.amt) * 100 : null,
        };
      }
    }
    return NextResponse.json({ bidPackages: rows });
  } catch {
    return NextResponse.json({ bidPackages: [], error: "Internal server error" }, { status: 500 });
  }
}
