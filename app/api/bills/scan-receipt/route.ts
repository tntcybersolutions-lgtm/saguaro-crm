import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { storageObjectKey } from '@/lib/storage-signing';
import { extractJson, messageText } from '@/lib/ai-json';
import { normalizeReceipt, receiptPrompt } from '@/lib/receipt-read';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/bills/scan-receipt — read a photographed receipt or vendor invoice.
 * Body: { projectId, fileUrl } — fileUrl is the receipt the bills page just
 * uploaded to the job's files (lib/upload-direct), so the bytes never pass
 * through this function. Returns the fields to prefill the bill form with
 * (lib/receipt-read); nothing is saved until the person presses Save Bill.
 */
const READABLE = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/;

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const { db, user } = g;

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const fileUrl = typeof body.fileUrl === 'string' ? body.fileUrl : '';
  if (!projectId || !fileUrl) return NextResponse.json({ error: 'projectId and fileUrl are required' }, { status: 400 });

  // The file must be in THIS company's storage — never read another tenant's object.
  const key = storageObjectKey(fileUrl);
  const slash = key ? key.indexOf('/') : -1;
  const bucket = key && slash > 0 ? key.slice(0, slash) : '';
  const path = key && slash > 0 ? key.slice(slash + 1) : '';
  if (!bucket || !path.startsWith(`${user.tenantId}/`)) {
    return NextResponse.json({ error: 'That file is not one of yours' }, { status: 403 });
  }

  try {
    const { data: project, error: pErr } = await db.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (pErr) throw pErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const { data: lines, error: lErr } = await db
      .from('budget_lines')
      .select('cost_code, description')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .not('cost_code', 'is', null);
    if (lErr) throw lErr;
    const costCodes = ((lines || []) as Array<{ cost_code: string | null; description: string | null }>)
      .filter((l): l is { cost_code: string; description: string | null } => !!l.cost_code);

    const { data: blob, error: dErr } = await db.storage.from(bucket).download(path);
    if (dErr || !blob) throw dErr || new Error('receipt download failed');
    const type = (blob.type || '').toLowerCase() || (/\.pdf$/i.test(path) ? 'application/pdf' : 'image/jpeg');
    if (!READABLE.test(type)) {
      return NextResponse.json({ error: 'Take a photo (JPG or PNG) or upload a PDF of the receipt.' }, { status: 415 });
    }
    const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');

    let reply = '';
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            type === 'application/pdf'
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
              : { type: 'image', source: { type: 'base64', media_type: type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: b64 } },
            { type: 'text', text: receiptPrompt(costCodes) },
          ],
        }],
      });
      reply = messageText(resp);
    } catch (err: unknown) {
      // The model call failing is not "the receipt was blank" — say which it is.
      const e = err as { status?: number; message?: string; error?: { error?: { message?: string } } };
      console.error('[bills/scan-receipt] model call failed', e?.status, e?.message);
      const upstream = String(e?.error?.error?.message ?? e?.message ?? '');
      const msg = /credit balance|insufficient|quota|billing/i.test(upstream)
        ? 'Receipt reading is unavailable right now — enter the bill by hand; your receipt is saved.'
        : e?.status === 429
          ? 'Receipt reading is busy — try again in a moment.'
          : 'The receipt could not be read. Enter the bill by hand; your receipt is saved.';
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const parsed = extractJson(reply);
    if (!parsed) return NextResponse.json({ error: 'The receipt could not be read. Enter the bill by hand; your receipt is saved.' }, { status: 502 });
    const receipt = normalizeReceipt(parsed, costCodes.map((c) => c.cost_code));
    return NextResponse.json({ ok: true, receipt });
  } catch (e) {
    return apiError('bills/scan-receipt', e, 'The receipt could not be read. Please try again.');
  }
}
