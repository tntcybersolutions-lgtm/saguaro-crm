import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateNTP } from '@/lib/document-templates/ntp-generator';

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

    const result = await generateNTP({
      projectId: body.projectId,
      ntpDate: body.ntpDate || new Date().toISOString().split('T')[0],
    });

    return NextResponse.json({ pdfUrl: result.pdfUrl, success: true });
  } catch (err: unknown) {
    const message = 'Document generation failed';
    console.error('[documents/ntp]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
