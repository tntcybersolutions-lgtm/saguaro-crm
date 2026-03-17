import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Deliveries stored in punch_list_items with trade='delivery'
    const row = {
      tenant_id:   user.tenantId,
      project_id:  body.projectId || body.project_id,
      description: body.description || `Delivery from ${body.supplier || 'Unknown'}`,
      location:    body.supplier || 'Unknown Supplier',
      trade:       'delivery',
      status:      body.condition === 'Refused' ? 'flagged' : 'open',
      priority:    'normal',
      notes: JSON.stringify({
        po_number:    body.poNumber    || '',
        qty_ordered:  body.qtyOrdered  || '',
        qty_received: body.qtyReceived || '',
        condition:    body.condition   || 'Accepted',
        received_by:  body.receivedBy  || '',
        delivery_time: new Date().toISOString(),
        extra_notes:  body.notes       || '',
      }),
      photo_urls: body.photoUrls || [],
    };

    const { data, error } = await supabase
      .from('punch_list_items')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, delivery: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[deliveries/create] error:', msg);
    return NextResponse.json(
      { error: `[deliveries/create] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
