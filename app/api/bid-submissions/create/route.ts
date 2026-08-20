import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      bidPackageId, companyName, contactName, contactEmail, contactPhone,
      licenseNumber, baseBid, alternate1, alternate2, exclusions,
      inclusions, clarifications, unitPriceItems,
    } = body;

    if (!bidPackageId) return NextResponse.json({ error: 'Missing bidPackageId' }, { status: 400 });
    if (!companyName) return NextResponse.json({ error: 'Missing companyName' }, { status: 400 });
    if (baseBid === undefined || baseBid === null) return NextResponse.json({ error: 'Missing baseBid' }, { status: 400 });

    const db = createServerClient();

    // Verify bid package belongs to tenant
    const { data: pkg, error: pkgErr } = await db
      .from('bid_packages')
      .select('id, project_id, estimated_value')
      .eq('id', bidPackageId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (pkgErr || !pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });

    const numBid = typeof baseBid === 'number' ? baseBid : parseFloat(String(baseBid));

    // Insert the submission
    const { data: submission, error: insertErr } = await db
      .from('bid_submissions')
      .insert({
        bid_package_id: bidPackageId,
        project_id: pkg.project_id,
        tenant_id: user.tenantId,
        company_name: companyName,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        license_number: licenseNumber || null,
        base_bid: numBid,
        base_amount: numBid,
        alternate_1: alternate1 ?? null,
        alternate_2: alternate2 ?? null,
        exclusions: exclusions || null,
        inclusions: inclusions || null,
        clarifications: clarifications || null,
        unit_price_items: unitPriceItems || [],
        status: 'received',
        received_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Recalculate is_low_bid for all bids on this package
    const { data: allBids } = await db
      .from('bid_submissions')
      .select('id, base_bid')
      .eq('bid_package_id', bidPackageId)
      .eq('tenant_id', user.tenantId)
      .not('base_bid', 'is', null)
      .order('base_bid', { ascending: true });

    if (allBids && allBids.length > 0) {
      const lowId = allBids[0].id;
      // Reset all
      await db
        .from('bid_submissions')
        .update({ is_low_bid: false })
        .eq('bid_package_id', bidPackageId)
        .eq('tenant_id', user.tenantId);
      // Set the lowest
      await db
        .from('bid_submissions')
        .update({ is_low_bid: true })
        .eq('id', lowId)
        .eq('tenant_id', user.tenantId);

      // Update bid_packages stats
      const lowBid = allBids[0].base_bid;
      const highBid = allBids[allBids.length - 1].base_bid;
      const spreadPct = lowBid > 0 ? ((highBid - lowBid) / lowBid * 100) : 0;

      await db
        .from('bid_packages')
        .update({
          bid_count: allBids.length,
          low_bid_amount: lowBid,
          spread_pct: Math.round(spreadPct * 10) / 10,
        })
        .eq('id', bidPackageId)
        .eq('tenant_id', user.tenantId);
    }

    return NextResponse.json({ data: submission });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
