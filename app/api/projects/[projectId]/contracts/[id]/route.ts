import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['title','contract_type','vendor_name','vendor_email','description','original_amount','approved_changes','retainage_pct','start_date','end_date','signed_date','status','scope_of_work','insurance_required','insurance_verified','bonding_required','bonding_verified','notes','invoiced_amount','paid_amount'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    const { data, error } = await supabase.from('contracts').update(updates).eq('id', params.id).eq('project_id', params.projectId).select().single();
    if (error) throw error;
    return NextResponse.json({ contract: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
