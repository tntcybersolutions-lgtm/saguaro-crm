import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('prequal_submissions')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
    }
    if (!body.status || !['approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Status must be approved or rejected' }, { status: 400 });
    }

    const db = createServerClient();
    const updateData: Record<string, unknown> = {
      status: body.status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: body.notes || null,
      updated_at: new Date().toISOString(),
    };

    if (body.status === 'approved') {
      updateData.approved_at = new Date().toISOString();
    }
    if (body.status === 'rejected') {
      updateData.rejection_reason = body.rejection_reason || body.notes || null;
    }

    const { data, error } = await db
      .from('prequal_submissions')
      .update(updateData)
      .eq('id', body.id)
      .eq('tenant_id', user.tenantId)
      .select('id, status')
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
