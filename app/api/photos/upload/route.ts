import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const image = formData.get('image') as File | null;
    const upload = file || image;
    const projectId = (formData.get('projectId') as string) || 'unknown';
    const category  = (formData.get('category')  as string) || 'Progress';
    const caption   = (formData.get('caption')   as string) || '';
    const filename  = upload?.name || `photo-${Date.now()}.jpg`;

    if (!upload) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const buffer = Buffer.from(await upload.arrayBuffer());
    const storagePath = `projects/${projectId}/photos/${Date.now()}-${filename}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(storagePath, buffer, { contentType: upload.type || 'image/jpeg' });

    if (uploadError || !uploadData) {
      console.error('[photos/upload] storage error:', uploadError?.message);
      return NextResponse.json({ error: uploadError?.message || 'Upload failed' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from('project-files')
      .getPublicUrl(storagePath);

    const url = urlData?.publicUrl || null;
    const photoId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return NextResponse.json({
      success: true,
      photo: {
        id: photoId,
        url,
        filename,
        category,
        caption,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[photos/upload] error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
