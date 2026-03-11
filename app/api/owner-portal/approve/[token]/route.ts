import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('pay_applications')
      .select('*, projects(*), schedule_of_values(*)')
      .eq('owner_approval_token', token)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const pa = data as any;
    return NextResponse.json({
      payApp: pa,
      project: pa.projects,
      lineItems: pa.schedule_of_values || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const body = await req.json();
    const { action, note } = body;
    const db = createServerClient();
    const newStatus = action === 'approved' ? 'certified' : 'draft';
    const { error } = await db
      .from('pay_applications')
      .update({ status: newStatus, owner_notes: note, owner_approved_at: action === 'approved' ? new Date().toISOString() : null })
      .eq('owner_approval_token', token);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
