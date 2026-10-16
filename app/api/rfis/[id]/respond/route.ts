import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { onRFIAnswered } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';
import { apiError } from '@/lib/api-error';

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
    const { error: updateError } = await db
      .from('rfis')
      .update({
        answer,
        answered_by: user.email || '',
        answered_at: nowIso,
        answered_date: nowIso,
        status: 'answered',
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (updateError) throw updateError;

    // Record an official response entry
    const { error: writeErr } = await db.from('rfi_responses').insert({
      tenant_id: user.tenantId,
      rfi_id: id,
      responder_name: user.email || '',
      responder_email: user.email || '',
      response_text: answer,
      attachments: attachments.length ? attachments : [],
      is_official: true,
      responded_at: nowIso,
    });
    if (writeErr) {
      console.error('[rfis/respond]', writeErr);
      throw writeErr;
    }

    runInBackground(onRFIAnswered(id), 'onRFIAnswered');

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('rfis/[id]/respond POST', e);
  }
}
