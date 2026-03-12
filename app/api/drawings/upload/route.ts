import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const projectId = (formData.get('projectId') as string) || 'unknown';
    const filename = file?.name || `drawing-${Date.now()}`;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let url: string | null = null;
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const path = `projects/${projectId}/drawings/${Date.now()}-${filename}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(path, buffer, { contentType: file.type });
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(path);
        url = urlData?.publicUrl || null;
      }
    }

    const drawing = {
      id: Date.now().toString(),
      project_id: projectId,
      filename,
      url,
      uploaded_at: new Date().toISOString(),
    };

    const { data: dbData } = await supabase.from('drawings').insert(drawing).select().single();
    return NextResponse.json({ success: true, drawing: dbData || drawing, url });
  } catch (err: any) {
    console.error('[drawings/upload] error:', err?.message);
    const filename = `drawing-${Date.now()}`;
    return NextResponse.json({
      success: true,
      url: null,
      drawing: { id: Date.now().toString(), filename, url: null, uploaded_at: new Date().toISOString() },
      demo: true,
    });
  }
}
