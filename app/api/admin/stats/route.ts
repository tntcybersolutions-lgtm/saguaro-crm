/**
 * GET /api/admin/stats — Super-admin stats endpoint
 * Returns all tenants, subscriptions, and revenue data.
 * Only accessible by chad@tntcybersolutions.com or role=admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const ADMIN_EMAILS = ['chad@tntcybersolutions.com'];

import { PLAN_PRICING } from '@/lib/plan-pricing';

const PLAN_PRICES: Record<string, number> = {
  silver: PLAN_PRICING.silver.monthly,
  gold: PLAN_PRICING.gold.monthly,
  platinum: PLAN_PRICING.platinum.monthly,
};

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check admin access
  const db = createServerClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single();

  const isAdmin = ADMIN_EMAILS.includes(user.email) || profile?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    // Fetch all tenants
    const { data: tenants, error: tErr } = await db
      .from('tenants')
      .select('id, name, slug, plan, trial_ends_at, expires_at, owner_email, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (tErr) throw tErr;

    // Fetch all subscriptions
    const { data: subs, error: sErr } = await db
      .from('subscriptions')
      .select('tenant_id, plan_id, status, billing_interval, stripe_customer_id, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (sErr) throw sErr;

    const now = new Date();
    const allTenants = tenants || [];
    const allSubs = subs || [];

    // Compute stats
    const trialCount = allTenants.filter(t => t.plan === 'trial').length;
    const expiredTrials = allTenants.filter(t => {
      if (t.plan !== 'trial') return false;
      const exp = t.trial_ends_at || t.expires_at;
      return exp && new Date(exp) < now;
    }).length;
    const activeSubCount = allSubs.filter(s => s.status === 'active').length;
    const canceledCount = allSubs.filter(s => s.status === 'canceled').length;
    const pastDueCount = allSubs.filter(s => s.status === 'past_due').length;

    // Estimate MRR from active subscriptions
    const mrr = allSubs
      .filter(s => s.status === 'active')
      .reduce((sum, s) => {
        const price = PLAN_PRICES[s.plan_id] || 0;
        return sum + (s.billing_interval === 'annual' ? Math.round(price * 0.83) : price);
      }, 0);

    return NextResponse.json({
      tenants: allTenants,
      subscriptions: allSubs,
      stats: {
        total_tenants: allTenants.length,
        trial_count: trialCount,
        expired_trials: expiredTrials,
        active_subscriptions: activeSubCount,
        canceled_count: canceledCount,
        past_due_count: pastDueCount,
        mrr,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
