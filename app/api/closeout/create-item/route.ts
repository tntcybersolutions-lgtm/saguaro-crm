import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.project_id) return NextResponse.json({ error: 'Missing required field: project_id' }, { status: 400 });
    if (!body.title) return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 });

    const db = createServerClient();
    const { data, error } = await db
      .from('closeout_items')
      .insert({
        tenant_id: user.tenantId,
        project_id: body.project_id,
        item_number: body.item_number || null,
        category: body.category || 'other',
        title: body.title,
        description: body.description || null,
        required_from: body.required_from || null,
        assigned_to: body.assigned_to || null,
        status: body.status || 'pending',
        due_date: body.due_date || null,
        notes: body.notes || null,
        file_url: body.file_url || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
