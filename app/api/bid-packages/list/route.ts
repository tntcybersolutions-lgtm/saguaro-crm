import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, hasAnyPermission, PROPOSAL_MONEY } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { bidAmount } from '@/lib/bid-amount';
import { inviteState } from '@/lib/bid-invite-state';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    // Packages are a Projects tool; the low bid, who holds it and the spread are
    // money — Bid and proposal dollars: Sales or Budget (PROPOSAL_MONEY, lib/permissions).
    const g = await requirePermission(req, 'Projects', 'View', { projectId });
    if (!g.ok) return g.res;
    const user = g.user;
    const showBids = hasAnyPermission(g.perms, PROPOSAL_MONEY, 'View');

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
      const [{ data: invites, error: invErr }, { data: submissions, error: subErr }] = await Promise.all([
        db.from('bid_package_invites').select('bid_package_id, status, response_status').eq('tenant_id', user.tenantId).in('bid_package_id', ids),
        db.from('bid_submissions').select('*').eq('tenant_id', user.tenantId).in('bid_package_id', ids),
      ]);
      if (invErr) throw invErr;
      if (subErr) throw subErr;
      const invitedBy: Record<string, number> = {};
      for (const inv of (invites || []) as any[]) {
        /* A revoked link is no longer an invitation. */
        if (inv.bid_package_id && inviteState(inv) !== 'revoked') invitedBy[inv.bid_package_id] = (invitedBy[inv.bid_package_id] || 0) + 1;
      }
      const subsBy: Record<string, { amt: number; who: string }[]> = {};
      for (const s of (submissions || []) as any[]) {
        if (!s.bid_package_id || String(s.status || '').toLowerCase() === 'withdrawn') continue;
        /* amount defaults to 0, so amount ?? base_amount read every portal bid as $0. */
        const amt = bidAmount(s);
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
          low: showBids && low ? low.amt : null,
          lowWho: showBids && low ? low.who : null,
          spread: showBids && low && high && amts.length >= 2 && low.amt > 0 ? ((high.amt - low.amt) / low.amt) * 100 : null,
        };
      }
    }
    return NextResponse.json({ bidPackages: rows });
  } catch (e) {
    return apiError('bid-packages/list', e, 'Bid packages could not be loaded. Try again.');
  }
}
