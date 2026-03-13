import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { module, item_id, items, include_photos, include_signatures } = body;

    const supabase = createServerClient();

    // Fetch the item(s) data based on module
    const tableMap: Record<string, string> = {
      'rfis': 'rfis',
      'punch': 'punch_list',
      'inspections': 'inspections',
      'daily_logs': 'daily_logs',
      'change_orders': 'change_orders',
      'safety': 'safety_incidents',
      'submittals': 'submittals',
      'observations': 'observations',
      'tm_tickets': 'tm_tickets',
      'meetings': 'meetings',
      'correspondence': 'correspondence',
    };

    const table = tableMap[module];
    if (!table) return NextResponse.json({ error: 'Invalid module' }, { status: 400 });

    let data;
    if (item_id) {
      const result = await supabase.from(table).select('*').eq('id', item_id).single();
      data = result.data ? [result.data] : [];
    } else if (items && Array.isArray(items)) {
      const result = await supabase.from(table).select('*').in('id', items);
      data = result.data || [];
    } else {
      const result = await supabase.from(table).select('*').eq('project_id', params.projectId).limit(100);
      data = result.data || [];
    }

    // Return the data as JSON (client generates PDF) or generate server-side
    return NextResponse.json({
      success: true,
      module,
      data,
      generated_at: new Date().toISOString(),
      project_id: params.projectId,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 });
  }
}
