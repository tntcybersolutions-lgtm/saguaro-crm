import { NextResponse } from 'next/server';

interface DashStats {
  activeProjects: number;
  openBids: number;
  pendingPayApps: number;
  totalContractValue: number;
  monthlyRevenue: number;
}

const DEMO_STATS: DashStats = {
  activeProjects: 1,
  openBids: 3,
  pendingPayApps: 1,
  totalContractValue: 2_850_000,
  monthlyRevenue: 257_400,
};

export async function GET() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey || supabaseUrl === 'https://demo.supabase.co') {
      throw new Error('demo-mode');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Run all queries in parallel
    const [
      { count: activeProjects },
      { count: openBids },
      { count: pendingPayApps },
      { data: contractData },
    ] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('bids').select('id', { count: 'exact', head: true }).in('status', ['draft', 'submitted', 'under_review']),
      supabase.from('pay_applications').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('projects').select('contract_amount').eq('status', 'active'),
    ]);

    const totalContractValue = (contractData ?? []).reduce(
      (sum: number, p: { contract_amount: number }) => sum + (p.contract_amount ?? 0),
      0
    );

    // Monthly revenue: sum of pay apps approved this calendar month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: revenueRows } = await supabase
      .from('pay_applications')
      .select('current_payment_due')
      .eq('status', 'approved')
      .gte('submitted_at', startOfMonth.toISOString());

    const monthlyRevenue = (revenueRows ?? []).reduce(
      (sum: number, r: { current_payment_due: number }) => sum + (r.current_payment_due ?? 0),
      0
    );

    const stats: DashStats = {
      activeProjects: activeProjects ?? 0,
      openBids: openBids ?? 0,
      pendingPayApps: pendingPayApps ?? 0,
      totalContractValue,
      monthlyRevenue,
    };

    return NextResponse.json(stats);

  } catch {
    return NextResponse.json(DEMO_STATS);
  }
}
