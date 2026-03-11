import { NextRequest, NextResponse } from 'next/server';
import { generateG704, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('*').eq('id', body.projectId).single();
    const p = project as any;

    // Get punch list items
    const { data: punchList } = await db.from('punch_list_items').select('description').eq('project_id', body.projectId).eq('status', 'open').limit(10);

    const pdfBytes = await generateG704({
      projectName: p?.name || body.projectName,
      projectAddress: p?.address || '',
      ownerName: p?.owner_entity?.name || body.ownerName || '',
      architectName: p?.architect_entity?.name || body.architectName || '',
      gcName: body.gcName || 'General Contractor',
      contractDate: p?.start_date || '',
      completionDate: body.completionDate || new Date().toISOString().split('T')[0],
      contractSum: p?.contract_amount || 0,
      punchListItems: (punchList || []).map((i: any) => i.description),
    });

    const pdfUrl = await saveDocument(body.projectId, 'g704', pdfBytes, body, user?.id || p?.tenant_id);
    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
