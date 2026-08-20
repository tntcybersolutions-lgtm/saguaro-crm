import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateRFI } from '@/lib/pdf-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    const { data: rfi, error: rfiErr } = await db
      .from('rfis')
      .select('*, projects(id, name, project_number, owner_name, architect_name, gc_name)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (rfiErr || !rfi) {
      return NextResponse.json({ error: 'RFI not found' }, { status: 404 });
    }

    const r = rfi as Record<string, unknown>;
    const project = r.projects as Record<string, unknown> | null;

    const pdfBytes = await generateRFI({
      rfiNumber:        String(r.rfi_number || ''),
      subject:          String(r.subject || ''),
      question:         String(r.question || ''),
      answer:           r.answer ? String(r.answer) : undefined,
      specSection:      r.spec_section ? String(r.spec_section) : undefined,
      drawingReference: r.drawing_reference ? String(r.drawing_reference) : undefined,
      dueDate:          r.due_date ? String(r.due_date) : undefined,
      submittedBy:      r.submitted_by ? String(r.submitted_by) : undefined,
      submittedAt:      r.submitted_at ? String(r.submitted_at) : (r.created_at ? String(r.created_at) : undefined),
      answeredBy:       r.answered_by ? String(r.answered_by) : undefined,
      answeredAt:       r.answered_at ? String(r.answered_at) : undefined,
      status:           String(r.status || 'draft'),
      isUrgent:         Boolean(r.is_urgent),
      notes:            r.notes ? String(r.notes) : undefined,
      projectName:      project ? String(project.name || '') : '',
      projectNumber:    project ? String(project.project_number || '') : '',
      ownerName:        project ? String(project.owner_name || '') : '',
      architectName:    project ? String(project.architect_name || '') : '',
      gcName:           project ? String(project.gc_name || '') : '',
    });

    // Update the RFI with PDF generation timestamp
    await db
      .from('rfis')
      .update({ pdf_generated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${r.rfi_number || 'RFI'}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[rfis/generate-pdf] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
