import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { generateSubcontract } from '@/lib/document-templates/subcontract-generator';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    if (!body.projectId || !body.subId) {
      return NextResponse.json(
        { error: 'projectId and subId are required' },
        { status: 400 }
      );
    }

    // Verify project exists
    const { data: project } = await db
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .eq('tenant_id', g.user.tenantId)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { pdfUrl } = await generateSubcontract({
      projectId: body.projectId,
      subId: body.subId,
      bidPackageId: body.bidPackageId,
      // What the GC edited on the form. Absent, the generator derives
      // everything itself exactly as it did before.
      overrides: body.overrides && typeof body.overrides === 'object' ? body.overrides : undefined,
    });

    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: unknown) {
    const message = 'Document generation failed';
    console.error('[documents/subcontract]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
