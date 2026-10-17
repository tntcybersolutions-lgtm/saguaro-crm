import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { onRFIAnswered } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';
import { apiError } from '@/lib/api-error';
import { writeWithOptionalColumns } from '@/lib/optional-column';
import { recordOfficialResponse } from '@/lib/rfi-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rfis/[id]/respond
 * Submit an official RFI response. Called from app/field/rfis/page.tsx.
 *
 * Accepts EITHER:
 *   - JSON  { answer: string }
 *   - FormData with fields { answer: string, photo?: File }
 *
 * Updates the rfis row (answer / answered_by / answered_at / status='answered')
 * and records an official entry in rfi_responses. Optionally uploads a photo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await requirePermission(req, 'RFIs', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const { id } = await params;

  let answer = '';
  let photo: File | null = null;

  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData().catch(() => null);
      if (form) {
        answer = (form.get('answer') as string) || '';
        const f = form.get('photo');
        if (f && typeof f !== 'string') photo = f as File;
      }
    } else {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));
      answer = (body.answer as string) || (body.response_text as string) || '';
    }
  } catch {
    /* fall through with safe defaults */
  }

  answer = (answer || '').trim();

  try {
    const db = createServerClient();

    // Optional photo upload -> project-files bucket
    const attachments: Array<{ name: string; url: string }> = [];
    if (photo) {
      try {
        const buffer = Buffer.from(await photo.arrayBuffer());
        const safeName = photo.name || `rfi-response-${Date.now()}`;
        const path = `rfis/${id}/responses/${Date.now()}-${safeName}`;
        const { data: uploadData, error: uploadError } = await db.storage
          .from('project-files')
          .upload(path, buffer, { contentType: photo.type || 'application/octet-stream' });
        if (!uploadError && uploadData) {
          const { data: urlData } = db.storage.from('project-files').getPublicUrl(path);
          if (urlData?.publicUrl) attachments.push({ name: safeName, url: urlData.publicUrl });
        }
      } catch {
        /* ignore upload failure — still record the answer */
      }
    }

    const nowIso = new Date().toISOString();

    // Update the RFI with the official answer
    // answer_source: null — an answer given here replaces one that came by email (lib/inbound-reply).
    const { result: { error: updateError } } = await writeWithOptionalColumns(
      {
        answer,
        answered_by: user.email || '',
        answered_at: nowIso,
        answered_date: nowIso,
        status: 'answered',
        answer_source: null,
      },
      ['answer_source'],
      (row) => db.from('rfis').update(row as never).eq('id', id).eq('tenant_id', user.tenantId),
    );

    if (updateError) throw updateError;

    // The official response on the RFI's thread — the only official one (lib/rfi-server).
    await recordOfficialResponse(db, user.tenantId, id, {
      text: answer,
      name: user.email || '',
      email: user.email || null,
      attachments,
    });

    runInBackground(onRFIAnswered(id), 'onRFIAnswered');

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('rfis/[id]/respond POST', e);
  }
}
