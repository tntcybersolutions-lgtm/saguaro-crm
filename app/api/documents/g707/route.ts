import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateG707 } from '@/lib/document-templates/g707-generator';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    const { data: project } = await db
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .single();
    const p = project as any;

    const result = await generateG707({
      projectId: body.projectId,
      suretyName: body.suretyName || '',
      suretyAddress: body.suretyAddress || '',
      bondNumber: body.bondNumber || '',
    });

    return NextResponse.json({ pdfUrl: result.pdfUrl, success: true });
  } catch (err: unknown) {
    const message = 'Document generation failed';
    console.error('[documents/g707]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
