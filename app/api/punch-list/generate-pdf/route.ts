import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generatePunchList } from '@/lib/pdf-engine';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  const projectId = (body.projectId || body.project_id) as string | undefined;
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();

    // Fetch project info
    const { data: project } = await db
      .from('projects')
      .select('name, project_number, address')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    // Fetch all punch list items for this project
    const { data: items, error } = await db
      .from('punch_list')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('location', { ascending: true })
      .order('item_number', { ascending: true });

    if (error) throw error;

    const pdfBytes = await generatePunchList({
      projectName:   project?.name || 'Unknown Project',
      projectNumber: project?.project_number || '',
      projectAddress: project?.address || '',
      items:         items || [],
      generatedBy:   user.email,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Punch-List-${project?.project_number || projectId}.pdf"`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
