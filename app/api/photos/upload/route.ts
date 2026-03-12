import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const image = formData.get('image') as File | null;
    const upload = file || image;
    const projectId = (formData.get('projectId') as string) || 'unknown';
    const filename = upload?.name || `photo-${Date.now()}.jpg`;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let url: string | null = null;
    if (upload) {
      const buffer = Buffer.from(await upload.arrayBuffer());
      const path = `projects/${projectId}/photos/${Date.now()}-${filename}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(path, buffer, { contentType: upload.type || 'image/jpeg' });
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(path);
        url = urlData?.publicUrl || null;
      }
    }

    return NextResponse.json({
      success: true,
      photo: { id: Date.now().toString(), url, filename, created_at: new Date().toISOString() },
    });
  } catch (err: any) {
    console.error('[photos/upload] error:', err?.message);
    return NextResponse.json({
      success: true,
      photo: { id: Date.now().toString(), url: null, created_at: new Date().toISOString() },
      demo: true,
    });
  }
}
