import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = createServerClient();
    const [{ data: payApp }, { data: lineItems }] = await Promise.all([
      db.from('pay_applications').select('*, projects(*)').eq('id', id).single(),
      db.from('schedule_of_values').select('*').eq('pay_app_id', id).order('line_number'),
    ]);
    if (!payApp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ payApp, lineItems: lineItems || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
