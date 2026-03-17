import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateDailyReport } from '@/lib/document-templates/daily-report-generator';

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

    // Fetch the daily log entry
    const { data: dailyLog } = await db
      .from('daily_logs')
      .select('*')
      .eq('id', body.dailyLogId)
      .single();

    const result = await generateDailyReport({
      projectId: body.projectId,
      dailyLogId: body.dailyLogId,
    });

    return NextResponse.json({ pdfUrl: result.pdfUrl, success: true });
  } catch (err: unknown) {
    const message = 'Document generation failed';
    console.error('[documents/daily-report]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
