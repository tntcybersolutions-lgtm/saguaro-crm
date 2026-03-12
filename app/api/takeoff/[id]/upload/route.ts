import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id: takeoffId } = await params;

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Accepted: PDF, PNG, JPG, TIFF' },
        { status: 400 }
      );
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum 50MB.' },
        { status: 400 }
      );
    }

    // Get takeoff to find project_id
    const { data: takeoff } = await supabase
      .from('takeoffs')
      .select('project_id')
      .eq('id', takeoffId)
      .single();

    if (!takeoff) {
      return NextResponse.json({ error: 'Takeoff not found' }, { status: 404 });
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop() || 'pdf';
    const storagePath = `${takeoff.project_id}/blueprints/${takeoffId}/blueprint.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('blueprints')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('blueprints')
      .getPublicUrl(storagePath);

    // Update takeoff record
    const { data: updated, error: updateError } = await supabase
      .from('takeoffs')
      .update({
        file_url: publicUrl,
        file_name: file.name,
        storage_path: storagePath,
        file_type: file.type,
        file_size: file.size,
        status: 'uploaded',
      })
      .eq('id', takeoffId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, takeoff: updated, fileUrl: publicUrl });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('[takeoff/upload]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
