import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPdfPageCount, generateThumbnail } from '@/lib/blueprint-processor';

export const runtime = 'nodejs';

const VALID_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/webp',
];

const FRIENDLY_ACCEPT = 'PDF, PNG, JPG, TIFF, or WebP';
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

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

    // Friendly file type validation
    if (!VALID_TYPES.includes(file.type)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'dwg' || ext === 'dxf') {
        return NextResponse.json(
          { error: `${ext.toUpperCase()} files are not yet supported. Please export as PDF from AutoCAD and upload that instead.` },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `Unsupported file type "${file.type || ext}". Accepted formats: ${FRIENDLY_ACCEPT}.` },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File is too large (${formatSize(file.size)}). Maximum size is ${formatSize(MAX_SIZE)}.` },
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

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Detect PDF page count (non-blocking — kicked off but not awaited yet)
    const pageCountPromise = file.type === 'application/pdf'
      ? getPdfPageCount(buffer)
      : Promise.resolve(0);

    // Upload blueprint to Supabase Storage
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const storagePath = `${takeoff.project_id}/blueprints/${takeoffId}/blueprint.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('blueprints')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Resolve page count now (upload was the slow part, this is fast)
    const pageCount = await pageCountPromise;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('blueprints')
      .getPublicUrl(storagePath);

    // Thumbnail — truly fire-and-forget, never blocks the upload response
    generateThumbnail(buffer, file.type).then(async (thumb) => {
      if (!thumb) return;
      const thumbPath = `${takeoff.project_id}/blueprints/${takeoffId}/thumbnail.jpg`;
      const { error: thumbErr } = await supabase.storage
        .from('blueprints')
        .upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: true });
      if (!thumbErr) {
        const { data: { publicUrl: thumbUrl } } = supabase.storage
          .from('blueprints').getPublicUrl(thumbPath);
        await supabase.from('takeoffs')
          .update({ thumbnail_url: thumbUrl })
          .eq('id', takeoffId);
      }
    }).catch((err) => {
      console.warn('[takeoff/upload] thumbnail (non-fatal):', err instanceof Error ? err.message : err);
    });

    // Update takeoff record
    const updatePayload: Record<string, unknown> = {
      file_url: publicUrl,
      file_name: file.name,
      storage_path: storagePath,
      file_type: file.type,
      file_size: file.size,
      status: 'uploaded',
    };

    if (pageCount > 0) {
      updatePayload.page_count = pageCount;
    }

    const { data: updated, error: updateError } = await supabase
      .from('takeoffs')
      .update(updatePayload)
      .eq('id', takeoffId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      takeoff: updated,
      fileUrl: publicUrl,
      fileSize: file.size,
      fileSizeFormatted: formatSize(file.size),
      pageCount: pageCount || undefined,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('[takeoff/upload]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
