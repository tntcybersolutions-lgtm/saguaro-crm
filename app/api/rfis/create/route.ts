import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onRFICreated } from '@/lib/triggers';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    const { data: project } = await db.from('projects').select('tenant_id').eq('id', body.projectId).single();
    const tenantId = user?.id || (project as any)?.tenant_id || 'demo';

    // Get next RFI number
    const { data: lastRFI } = await db.from('rfis').select('rfi_number').eq('project_id', body.projectId).order('rfi_number', { ascending: false }).limit(1).single();
    const rfiNumber = ((lastRFI as any)?.rfi_number || 0) + 1;

    const { data: rfi, error } = await db.from('rfis').insert({
      tenant_id: tenantId,
      project_id: body.projectId,
      rfi_number: rfiNumber,
      subject: body.subject,
      question: body.question,
      status: 'open',
      spec_section: body.specSection,
      due_date: body.dueDate,
      submitted_by: user?.id,
    }).select().single();

    if (error) throw error;
    onRFICreated((rfi as any).id).catch(console.error);
    return NextResponse.json({ rfi, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
