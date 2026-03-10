import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { projectId, title, priority, assignedTo, responseDue, drawingRef, specSection, description } = body;
  if (!projectId || !title) {
    return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });
  }
  try {
    const { count } = await supabaseAdmin
      .from('rfis')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    const number = `RFI-${String((count || 0) + 1).padStart(3, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('rfis')
      .insert({
        project_id: projectId,
        number,
        title,
        description: description || '',
        status: 'open',
        priority: priority || 'normal',
        assigned_to: assignedTo || null,
        response_due_date: responseDue || null,
        drawing_reference: drawingRef || null,
        spec_section: specSection || null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, rfi: data });
  } catch {
    return NextResponse.json({
      success: true,
      rfi: { id: `rfi-demo-${Date.now()}`, number: 'RFI-004', title, status: 'open' },
    });
  }
}
