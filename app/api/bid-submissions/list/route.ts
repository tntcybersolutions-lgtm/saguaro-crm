import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const bidPackageId = req.nextUrl.searchParams.get('bidPackageId');
    if (!bidPackageId) return NextResponse.json({ error: 'Missing bidPackageId' }, { status: 400 });

    const db = createServerClient();

    // Get bid package for estimated_value
    const { data: pkg } = await db
      .from('bid_packages')
      .select('id, estimated_value')
      .eq('id', bidPackageId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });

    // Get all submissions
    const { data: subs, error } = await db
      .from('bid_submissions')
      .select('*')
      .eq('bid_package_id', bidPackageId)
      .eq('tenant_id', user.tenantId)
      .not('base_bid', 'is', null)
      .order('base_bid', { ascending: true });
    if (error) throw error;

    const submissions = subs || [];
    const lowBid = submissions.length > 0 ? submissions[0].base_bid : null;

    // Enrich with computed fields
    const enriched = submissions.map((sub: Record<string, unknown>, idx: number) => {
      const baseBid = sub.base_bid as number;
      const estVal = pkg.estimated_value as number | null;
      const deltaVsEstimate = estVal && estVal > 0
        ? ((baseBid - estVal) / estVal * 100)
        : null;
      const deltaVsLowBid = submissions.length >= 2 && lowBid && baseBid > lowBid
        ? ((baseBid - lowBid) / lowBid * 100)
        : null;

      return {
        ...sub,
        delta_vs_estimate: deltaVsEstimate !== null ? Math.round(deltaVsEstimate * 10) / 10 : null,
        delta_vs_low_bid: deltaVsLowBid !== null ? Math.round(deltaVsLowBid * 10) / 10 : null,
        rank: idx + 1,
      };
    });

    return NextResponse.json({ data: enriched });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
