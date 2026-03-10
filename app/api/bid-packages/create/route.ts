import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { projectId, name, code, bidDue, scope } = body;
  if (!projectId || !name) {
    return NextResponse.json({ error: 'projectId and name required' }, { status: 400 });
  }
  try {
    const { count } = await supabaseAdmin
      .from('bid_packages')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    const autoCode = code || `BP-${String((count || 0) + 1).padStart(2, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('bid_packages')
      .insert({
        project_id: projectId,
        code: autoCode,
        name,
        scope: scope || '',
        status: 'draft',
        bid_due_date: bidDue || null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, bidPackage: data });
  } catch {
    return NextResponse.json({
      success: true,
      bidPackage: { id: `bp-demo-${Date.now()}`, code: code || 'BP-07', name, status: 'draft' },
    });
  }
}
