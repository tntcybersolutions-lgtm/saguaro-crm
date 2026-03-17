import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generatePrevailingWage } from '@/lib/document-templates/prevailing-wage-generator';

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

    const result = await generatePrevailingWage({
      projectId: body.projectId,
      county: body.county || 'Maricopa',
    });

    return NextResponse.json({ pdfUrl: result.pdfUrl, success: true });
  } catch (err: unknown) {
    const message = 'Document generation failed';
    console.error('[documents/prevailing-wage]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
