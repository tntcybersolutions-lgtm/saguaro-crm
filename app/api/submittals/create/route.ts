import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.projectId || !body.title) {
      return NextResponse.json({ error: 'projectId and title are required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('submittals').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      submittal_number: body.submittal_number || body.submittalNumber || '',
      title: body.title || '',
      spec_section: body.spec_section || body.specSection || '',
      trade: body.trade || '',
      status: body.status || 'pending',
      ball_in_court: body.ball_in_court || body.ballInCourt || 'Contractor',
      submitted_date: body.submitted_date || null,
      required_date: body.required_date || null,
      revision: body.revision ?? 0,
      notes: body.notes || '',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, submittal: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
