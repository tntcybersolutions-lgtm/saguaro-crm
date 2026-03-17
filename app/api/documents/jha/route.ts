import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateJHA } from '@/lib/document-templates/jha-generator';

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

    // Determine trade from request or project building type
    const trade = body.trade || p?.building_type || 'general';

    const result = await generateJHA({
      projectId: body.projectId,
      trade,
      hazards: body.hazards,
    });

    return NextResponse.json({ pdfUrl: result.pdfUrl, success: true });
  } catch (err: unknown) {
    const message = 'Document generation failed';
    console.error('[documents/jha]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
