import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const VALID_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
];

const MAX_PHOTO_SIZE = 50 * 1024 * 1024; // 50 MB per photo

/**
 * Try to extract GPS coordinates from a filename pattern.
 * Common patterns:
 *   DJI_0042_N33.4567_W112.0789.jpg
 *   IMG_20240315_33.4567_-112.0789.jpg
 *   photo_lat33.456_lon-112.078.jpg
 */
function extractGpsFromFilename(filename: string): { lat: number; lng: number } | null {
  // Pattern 1: N/S lat, E/W lng
  const nsew = filename.match(/[NS]([\d.]+)[_\s]*[EW]([\d.]+)/i);
  if (nsew) {
    let lat = parseFloat(nsew[1]);
    let lng = parseFloat(nsew[2]);
    if (filename.match(/S[\d.]+/i)) lat = -lat;
    if (filename.match(/W[\d.]+/i)) lng = -lng;
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  }

  // Pattern 2: lat/lon keywords
  const latlon = filename.match(/lat[_:]?([-\d.]+)[_\s]*(?:lon|lng)[_:]?([-\d.]+)/i);
  if (latlon) {
    const lat = parseFloat(latlon[1]);
    const lng = parseFloat(latlon[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  }

  // Pattern 3: two decimal numbers that look like coordinates
  const coords = filename.match(/([-]?\d{1,3}\.\d{3,})[_\s]+([-]?\d{1,3}\.\d{3,})/);
  if (coords) {
    const lat = parseFloat(coords[1]);
    const lng = parseFloat(coords[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const formData = await req.formData();

    const projectId = formData.get('project_id') as string | null;
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Verify project belongs to tenant
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Collect all photo files from FormData
    const photos: File[] = [];
    const allEntries = formData.getAll('photos');
    for (const entry of allEntries) {
      if (entry instanceof File) photos.push(entry);
    }

    if (photos.length === 0) {
      return NextResponse.json({ error: 'No photos provided' }, { status: 400 });
    }

    // Validate each photo
    for (const photo of photos) {
      if (!VALID_IMAGE_TYPES.includes(photo.type)) {
        return NextResponse.json(
          { error: `Unsupported file type for "${photo.name}". Accepted: JPEG, PNG, WebP, TIFF.` },
          { status: 400 },
        );
      }
      if (photo.size > MAX_PHOTO_SIZE) {
        return NextResponse.json(
          { error: `"${photo.name}" is too large (${(photo.size / 1024 / 1024).toFixed(1)} MB). Max 50 MB per photo.` },
          { status: 400 },
        );
      }
    }

    // Create drone_jobs record
    const jobId = randomUUID();
    const jobName = formData.get('job_name') as string || `Drone Flight ${new Date().toLocaleDateString()}`;

    const { data: job, error: jobErr } = await supabase
      .from('drone_jobs')
      .insert({
        id: jobId,
        project_id: projectId,
        tenant_id: user.tenantId,
        name: jobName,
        status: 'uploading',
        photo_count: 0,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (jobErr) {
      console.error('[drone/upload] job insert error:', jobErr.message);
      return NextResponse.json({ error: 'Failed to create drone job' }, { status: 500 });
    }

    // Upload each photo and create drone_photos records
    const photoRecords: Record<string, unknown>[] = [];
    let uploadedCount = 0;

    for (const photo of photos) {
      const photoId = randomUUID();
      const ext = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${projectId}/drone/${jobId}/${photoId}.${ext}`;

      const buffer = Buffer.from(await photo.arrayBuffer());

      const { error: uploadErr } = await supabase.storage
        .from('project-files')
        .upload(storagePath, buffer, {
          contentType: photo.type,
          upsert: false,
        });

      if (uploadErr) {
        console.error(`[drone/upload] storage error for ${photo.name}:`, uploadErr.message);
        continue; // Skip failed uploads but continue with others
      }

      // Try to extract GPS from filename
      const gps = extractGpsFromFilename(photo.name);

      const { data: { publicUrl } } = supabase.storage
        .from('project-files')
        .getPublicUrl(storagePath);

      photoRecords.push({
        id: photoId,
        drone_job_id: jobId,
        tenant_id: user.tenantId,
        file_name: photo.name,
        storage_path: storagePath,
        file_url: publicUrl,
        file_size: photo.size,
        gps_lat: gps?.lat || null,
        gps_lng: gps?.lng || null,
      });

      uploadedCount++;
    }

    // Batch insert photo records
    if (photoRecords.length > 0) {
      const { error: insertErr } = await supabase
        .from('drone_photos')
        .insert(photoRecords);

      if (insertErr) {
        console.error('[drone/upload] photo records insert error:', insertErr.message);
      }
    }

    // Update drone job with photo count and status
    const { data: updatedJob, error: updateErr } = await supabase
      .from('drone_jobs')
      .update({
        photo_count: uploadedCount,
        status: 'pending',
      })
      .eq('id', jobId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (updateErr) {
      console.error('[drone/upload] job update error:', updateErr.message);
    }

    return NextResponse.json({
      success: true,
      job: updatedJob || job,
      photoCount: uploadedCount,
    });
  } catch (err: unknown) {
    console.error('[drone/upload]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
