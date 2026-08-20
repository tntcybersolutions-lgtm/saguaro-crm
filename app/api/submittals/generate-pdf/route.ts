import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateSubmittal } from '@/lib/pdf-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { submittalId } = await req.json();
    if (!submittalId) {
      return NextResponse.json({ error: 'submittalId is required' }, { status: 400 });
    }

    const db = createServerClient();

    const { data: sub, error: subErr } = await db
      .from('submittals')
      .select('*, projects(id, name, project_number, owner_name, architect_name, gc_name)')
      .eq('id', submittalId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (subErr || !sub) {
      return NextResponse.json({ error: 'Submittal not found' }, { status: 404 });
    }

    const s = sub as Record<string, unknown>;
    const project = s.projects as Record<string, unknown> | null;

    const pdfBytes = await generateSubmittal({
      submittalNumber:  String(s.submittal_number || ''),
      title:            String(s.title || ''),
      submittalType:    String(s.submittal_type || 'shop_drawing'),
      specSection:      s.spec_section ? String(s.spec_section) : undefined,
      drawingReference: s.drawing_reference ? String(s.drawing_reference) : undefined,
      status:           String(s.status || 'draft'),
      revisionNumber:   Number(s.revision_number || 0),
      submittedBy:      s.submitted_by ? String(s.submitted_by) : undefined,
      submittedAt:      s.submitted_at ? String(s.submitted_at) : (s.created_at ? String(s.created_at) : undefined),
      reviewedBy:       s.reviewed_by ? String(s.reviewed_by) : undefined,
      reviewedAt:       s.reviewed_at ? String(s.reviewed_at) : undefined,
      reviewAction:     s.review_action ? String(s.review_action) : undefined,
      reviewComments:   s.review_comments ? String(s.review_comments) : undefined,
      dueDate:          s.due_date ? String(s.due_date) : undefined,
      daysToReview:     s.days_to_review ? Number(s.days_to_review) : 14,
      notes:            s.notes ? String(s.notes) : undefined,
      trade:            s.trade ? String(s.trade) : undefined,
      description:      s.description ? String(s.description) : undefined,
      fileName:         s.file_name ? String(s.file_name) : undefined,
      projectName:      project ? String(project.name || '') : '',
      projectNumber:    project ? String(project.project_number || '') : '',
      ownerName:        project ? String(project.owner_name || '') : '',
      architectName:    project ? String(project.architect_name || '') : '',
      gcName:           project ? String(project.gc_name || '') : '',
    });

    // Update pdf_url timestamp
    await db
      .from('submittals')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', submittalId)
      .eq('tenant_id', user.tenantId);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${s.submittal_number || 'Submittal'}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
