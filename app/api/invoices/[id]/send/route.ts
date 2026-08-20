import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { error } = await db
      .from('invoices')
      .update({ status: 'Sent', sent_date: new Date().toISOString() })
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[invoices/send]', err);
    return NextResponse.json({ error: 'Failed to send invoice' }, { status: 500 });
  }
}
