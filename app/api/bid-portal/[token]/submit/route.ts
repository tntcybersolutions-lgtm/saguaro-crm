import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// PUBLIC — no auth required. Token IS the authentication.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const db = createServerClient();

  try {
    // 1. Look up bid package by token
    const { data: pkg, error: pkgErr } = await db
      .from('bid_packages')
      .select('id, name, project_id, tenant_id, sub_portal_enabled, sub_portal_expires_at, bid_due_date')
      .eq('sub_portal_token', token)
      .single();

    if (pkgErr || !pkg) {
      return NextResponse.json({ error: 'Invalid or expired bid invitation' }, { status: 404 });
    }
    if (!pkg.sub_portal_enabled) {
      return NextResponse.json({ error: 'This bid portal has been deactivated' }, { status: 403 });
    }
    if (pkg.sub_portal_expires_at && new Date(pkg.sub_portal_expires_at) < new Date()) {
      return NextResponse.json({ error: 'This bid invitation has expired' }, { status: 410 });
    }

    // 2. Parse + validate body
    const body = await req.json();
    const {
      companyName, licenseNumber, contactName, contactEmail, contactPhone,
      baseBid, alternate1, alternate2,
      exclusions, inclusions, clarifications,
      bidBondIncluded, certifiedAccurate, readBidDocuments,
    } = body;

    if (!companyName?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    if (!licenseNumber?.trim()) return NextResponse.json({ error: 'License number is required' }, { status: 400 });
    if (!contactName?.trim()) return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    if (!contactEmail?.trim() || !contactEmail.includes('@')) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    if (!baseBid || baseBid <= 0) return NextResponse.json({ error: 'Base bid must be greater than $0' }, { status: 400 });
    if (!certifiedAccurate) return NextResponse.json({ error: 'You must certify the bid is accurate' }, { status: 400 });
    if (!readBidDocuments) return NextResponse.json({ error: 'You must confirm you have read the bid documents' }, { status: 400 });
    if (!exclusions?.trim()) return NextResponse.json({ error: 'Exclusions are required' }, { status: 400 });

    // 3. Check for duplicate submission
    const { data: existing } = await db
      .from('bid_submissions')
      .select('id')
      .eq('bid_package_id', pkg.id)
      .or(`company_name.ilike.${companyName.trim()},contact_email.ilike.${contactEmail.trim()}`)
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json({
        error: 'A bid from this company or email has already been received for this package',
        existingId: existing.id,
      }, { status: 409 });
    }

    // 4. Get project name for confirmation
    const { data: proj } = await db
      .from('projects')
      .select('name')
      .eq('id', pkg.project_id)
      .single();

    // 5. Insert submission
    const { data: submission, error: insertErr } = await db
      .from('bid_submissions')
      .insert({
        bid_package_id: pkg.id,
        project_id: pkg.project_id,
        tenant_id: pkg.tenant_id,
        company_name: companyName.trim(),
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone?.trim() || null,
        license_number: licenseNumber.trim(),
        base_bid: baseBid,
        base_amount: baseBid,
        alternate_1: alternate1 || null,
        alternate_2: alternate2 || null,
        exclusions: exclusions.trim(),
        inclusions: inclusions?.trim() || null,
        clarifications: clarifications?.trim() || null,
        bid_bond_submitted: bidBondIncluded || false,
        status: 'received',
        is_low_bid: false,
        received_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // 6. Recalculate is_low_bid across all submissions
    const { data: allBids } = await db
      .from('bid_submissions')
      .select('id, base_bid')
      .eq('bid_package_id', pkg.id)
      .not('status', 'eq', 'withdrawn');

    if (allBids && allBids.length > 0) {
      const minBid = Math.min(...allBids.map(b => b.base_bid || Infinity));
      for (const b of allBids) {
        await db.from('bid_submissions')
          .update({ is_low_bid: b.base_bid === minBid })
          .eq('id', b.id);
      }
    }

    // 7. Update bid package counts
    await db.from('bid_packages')
      .update({
        portal_submission_count: (allBids?.length || 1),
      })
      .eq('id', pkg.id);

    // 8. Create notification for GC
    // Find users in this tenant to notify
    const { data: tenantUsers } = await db
      .from('profiles')
      .select('id')
      .eq('tenant_id', pkg.tenant_id)
      .limit(5);

    if (tenantUsers) {
      for (const u of tenantUsers) {
        await db.from('notifications').insert({
          tenant_id: pkg.tenant_id,
          user_id: u.id,
          project_id: pkg.project_id,
          type: 'bid_received',
          title: `Bid received — ${companyName.trim()}`,
          body: `${pkg.name}: $${Number(baseBid).toLocaleString()} from ${companyName.trim()}`,
          link: `/app/projects/${pkg.project_id}/bid-packages`,
          priority: 'normal',
        });
      }
    }

    // 9. Return confirmation
    const confirmationNumber = `BID-${(submission?.id || '').slice(0, 8).toUpperCase()}`;

    return NextResponse.json({
      success: true,
      confirmation_number: confirmationNumber,
      company_name: companyName.trim(),
      base_bid: baseBid,
      package_name: pkg.name,
      project_name: proj?.name || 'Unknown Project',
      due_date: pkg.bid_due_date,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
