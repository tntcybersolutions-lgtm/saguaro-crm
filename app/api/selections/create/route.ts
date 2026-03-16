import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.projectId || !body.item) {
      return NextResponse.json({ error: 'projectId and item are required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('selections').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      category: body.category || 'Other',
      item: body.item || '',
      manufacturer: body.manufacturer || '',
      model: body.model || '',
      color: body.color || '',
      finish: body.finish || '',
      cost: Number(body.cost) || 0,
      allowance: Number(body.allowance) || 0,
      status: body.status || 'pending',
      selected_by: body.selected_by || body.selectedBy || '',
      owner_approved: body.owner_approved || false,
      due_date: body.due_date || null,
      notes: body.notes || '',
      link: body.link || '',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, selection: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
