import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateG701 } from '@/lib/document-templates/g701-generator';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    if (!body.projectId || !body.changeOrderId) {
      return NextResponse.json(
        { error: 'projectId and changeOrderId are required' },
        { status: 400 }
      );
    }

    // Verify project exists
    const { data: project } = await db
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { pdfUrl } = await generateG701({
      projectId: body.projectId,
      changeOrderId: body.changeOrderId,
    });

    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: unknown) {
    const message = 'Document generation failed';
    console.error('[documents/g701]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
