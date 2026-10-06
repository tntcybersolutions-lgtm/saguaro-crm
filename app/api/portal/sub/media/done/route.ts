import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { createNotification } from '@/lib/notifications';
import { authSubPortal, senderLabel, countPhrase } from '@/lib/sub-media';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/portal/sub/media/done?token=…  { batchId }
 *
 * Called once when a sub's upload batch finishes. Tells the GC's team in one
 * notification ("ABC Electric sent 6 photos and 1 video") instead of one per
 * file. Counts come from the rows actually saved for this batch, never from
 * the client.
 */
export async function POST(req: NextRequest) {
  const session = await authSubPortal(req);
  if (!session) return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { batchId?: unknown };
    const batchId = typeof body.batchId === 'string' ? body.batchId : '';
    if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

    const db = createServerClient() as any;
    const { data, error } = await db
      .from('sub_media_submissions')
      .select('kind, destination, note')
      .eq('tenant_id', session.tenant_id)
      .eq('portal_session_id', session.id)
      .eq('batch_id', batchId);
    if (error) throw error;
    const rows = (data || []) as Array<{ kind: string; destination: string; note: string | null }>;
    if (!rows.length) return NextResponse.json({ notified: false });

    const photos = rows.filter((r) => r.kind === 'image').length;
    const videos = rows.length - photos;
    const toGc = rows.some((r) => r.destination === 'gc');
    const who = senderLabel(session);
    const what = countPhrase(photos, videos);
    const note = rows.find((r) => r.note)?.note || '';
    await createNotification(
      session.tenant_id,
      null,
      'sub_media_submitted',
      toGc ? `${who} sent you ${what}` : `${who} posted ${what} to the job`,
      [toGc ? 'End of day — waiting for you to review.' : 'End of day — already in the job photos.', note ? `“${note.slice(0, 140)}”` : ''].filter(Boolean).join(' '),
      `/app/projects/${session.project_id}/photos?inbox=1`,
      session.project_id || undefined,
    );
    return NextResponse.json({ notified: true, photos, videos });
  } catch (e: unknown) {
    return apiError('portal/sub/media/done', e, "Couldn't notify the GC");
  }
}
