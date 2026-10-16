import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { generatePreliminaryNotice } from '@/lib/document-templates/preliminary-notice-generator';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    if (!body.projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
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

    const { pdfUrl } = await generatePreliminaryNotice({
      projectId: body.projectId,
      subId: body.subId,
      lenderName: body.lenderName,
      lenderAddress: body.lenderAddress,
    });

    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: unknown) {
    return apiError('documents/preliminary-notice POST', err, 'Document generation failed');
  }
}
