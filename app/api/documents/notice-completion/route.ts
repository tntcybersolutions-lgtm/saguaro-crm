import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { generateNoticeCompletion } from '@/lib/document-templates/notice-completion-generator';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    if (!body.projectId || !body.completionDate) {
      return NextResponse.json(
        { error: 'projectId and completionDate are required' },
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

    const { pdfUrl } = await generateNoticeCompletion({
      projectId: body.projectId,
      completionDate: body.completionDate,
    });

    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: unknown) {
    return apiError('documents/notice-completion POST', err, 'Document generation failed');
  }
}
