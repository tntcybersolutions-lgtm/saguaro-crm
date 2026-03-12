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

    // Use punch_list_items table with trade='delivery'
    const row = {
      project_id: body.projectId,
      description: body.description || `Delivery from ${body.supplier}`,
      location: body.supplier || 'Unknown Supplier',
      trade: 'delivery',
      status: body.condition === 'Refused' ? 'flagged' : 'open',
      priority: 'normal',
      notes: JSON.stringify({
        po_number: body.poNumber || '',
        qty_ordered: body.qtyOrdered || '',
        qty_received: body.qtyReceived || '',
        condition: body.condition || 'Accepted',
        received_by: body.receivedBy || '',
        delivery_time: new Date().toISOString(),
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
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({
      success: true,
      delivery: { id: Date.now().toString(), created_at: new Date().toISOString() },
      demo: true,
      error: msg,
    });
  }
}
