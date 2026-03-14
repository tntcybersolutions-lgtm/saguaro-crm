import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — List bid invitations for this sub */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();

    const { data: bids, error } = await db
      .from('portal_sub_bid_invitations')
      .select(
        `*,
         bid_package:bid_package_id(id, title, description, due_date, status),
         nda_signed`
      )
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ bids: bids || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/** POST — Submit bid response with line items, optionally sign NDA */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();
    const body = await req.json();
    const {
      bid_invitation_id,
      total_amount,
      line_items,
      notes,
      sign_nda,
      nda_signer_name,
    } = body;

    if (!bid_invitation_id) {
      return NextResponse.json(
        { error: 'bid_invitation_id is required' },
        { status: 400 }
      );
    }

    // Verify the invitation belongs to this sub
    const { data: invitation } = await db
      .from('portal_sub_bid_invitations')
      .select('*')
      .eq('id', bid_invitation_id)
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .single();

    if (!invitation) {
      return NextResponse.json(
        { error: 'Bid invitation not found' },
        { status: 404 }
      );
    }

    // Handle NDA signing if requested
    if (sign_nda) {
      await db
        .from('portal_sub_bid_invitations')
        .update({
          nda_signed: true,
          nda_signed_at: new Date().toISOString(),
          nda_signer_name: nda_signer_name || null,
        })
        .eq('id', bid_invitation_id)
        .eq('tenant_id', session.tenant_id);
    }

    // Create the bid response
    const { data: bidResponse, error: bidError } = await db
      .from('portal_sub_bid_responses')
      .insert({
        bid_invitation_id,
        sub_id: session.sub_id,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        total_amount: total_amount || 0,
        notes: notes || null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (bidError) throw bidError;

    // Insert line items if provided
    if (line_items && Array.isArray(line_items) && line_items.length > 0) {
      const lineItemRows = line_items.map((item: any) => ({
        bid_response_id: bidResponse.id,
        tenant_id: session.tenant_id,
        description: item.description,
        quantity: item.quantity || 1,
        unit: item.unit || 'LS',
        unit_price: item.unit_price || 0,
        total: item.total || (item.quantity || 1) * (item.unit_price || 0),
      }));

      const { error: lineError } = await db
        .from('portal_sub_bid_line_items')
        .insert(lineItemRows);

      if (lineError) throw lineError;
    }

    // Update invitation status
    await db
      .from('portal_sub_bid_invitations')
      .update({ status: 'responded' })
      .eq('id', bid_invitation_id)
      .eq('tenant_id', session.tenant_id);

    return NextResponse.json(
      { bid_response: bidResponse, message: 'Bid submitted successfully' },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
