import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ deliveries: [] }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Store deliveries in punch_list_items with trade='delivery'
    let query = supabase
      .from('punch_list_items')
      .select('*')
      .eq('trade', 'delivery')
      .order('created_at', { ascending: false })
      .limit(30);

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;

    const deliveries = (data || []).map((d) => {
      let meta: Record<string, unknown> = {};
      try { meta = JSON.parse(d.notes || '{}'); } catch { /* ok */ }
      return {
        id: d.id,
        project_id: d.project_id,
        supplier: d.location || 'Unknown Supplier',
        description: d.description,
        status: d.status || 'pending',
        po_number: meta.po_number || '',
        qty_ordered: meta.qty_ordered || '',
        qty_received: meta.qty_received || '',
        condition: meta.condition || 'Accepted',
        received_by: meta.received_by || '',
        photo_urls: d.photo_urls || [],
        created_at: d.created_at,
      };
    });

    return NextResponse.json({ deliveries });
  } catch {
    return NextResponse.json({ deliveries: [] });
  }
}
