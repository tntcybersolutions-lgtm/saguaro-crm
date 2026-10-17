/**
 * Server side of reply-by-email: take a verified Resend `email.received`
 * event, find the item its reply-to token names, and post the reply on it.
 *
 * Token-validated, like the other public token routes (CLAUDE.md §3): the
 * first read finds the item by the id inside the token; the token's MAC is
 * then checked with THAT item's tenant, and every read and write after it is
 * scoped to that tenant.
 *
 * Idempotent on Resend's email id (inbound_email_events unique key), with a
 * second guard on the RFC Message-ID per item, and rate-limited by token.
 * Every message that names a genuine token is recorded with what happened to
 * it — applied, or rejected with the reason.
 */
import { createHash } from 'node:crypto';
import { createServerClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { onRFIAnswered } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';
import { writeWithOptionalColumns } from '@/lib/optional-column';
import { checkRateLimit } from '@/lib/rate-limit';
import { classifyKind } from '@/lib/filekind';
import { normalizeEmail, verifyReplyToken, type ReplyItemType } from './token';
import { displayName } from './match';
import { extractReply } from './quote-strip';
import { pickToken, planReply, screenReply, VERDICT_LABEL, type RejectReason } from './screen';

type Db = ReturnType<typeof createServerClient>;
type Row = Record<string, unknown>;
/* eslint-disable @typescript-eslint/no-explicit-any */

const RESEND_API = 'https://api.resend.com';
const BUCKET = 'project-files';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/** Replies one token may post per hour (a real thread is a handful; a loop or a flood is not). */
export const TOKEN_HOURLY_LIMIT = 20;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Inline images under this size are signature logos and social icons, not photos of the job. */
const INLINE_LOGO_BYTES = 50 * 1024;

const TABLE: Record<ReplyItemType, string> = { rfis: 'rfis', submittals: 'submittals', change_orders: 'change_orders' };
const NOUN: Record<ReplyItemType, string> = { rfis: 'RFI', submittals: 'Submittal', change_orders: 'Change order' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InboundOutcome = {
  http: number;
  status: 'applied' | 'rejected' | 'ignored' | 'duplicate' | 'failed';
  reason?: RejectReason | string;
};

type ReceivedEmail = {
  id?: string;
  from?: string;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, unknown> | null;
  message_id?: string | null;
  authentication?: { spf?: string | null; dkim?: string | null; dmarc?: string | null } | null;
  attachments?: Array<{ id: string; filename?: string; content_type?: string; content_disposition?: string | null; content_id?: string | null; size?: number }>;
};

type AttachmentLink = { id: string; filename?: string; content_type?: string; content_disposition?: string | null; content_id?: string | null; size?: number; download_url?: string };

async function resendGet<T>(path: string): Promise<T> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const r = await fetch(`${RESEND_API}${path}`, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
  if (!r.ok) throw new Error(`Resend ${path} → HTTP ${r.status}`);
  return (await r.json()) as T;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function itemNumber(type: ReplyItemType, item: Row): string {
  const n = type === 'rfis' ? item.rfi_number : type === 'submittals' ? item.submittal_number : item.co_number;
  return n == null || n === '' ? '' : String(n);
}

function itemOwner(type: ReplyItemType, item: Row): string | null {
  const v = String((type === 'change_orders' ? item.submitted_by : item.created_by) || '');
  return UUID.test(v) ? v : null;
}

async function setEvent(db: Db, id: string, status: string, reason: string | null, result: Row = {}): Promise<void> {
  const { error } = await db.from('inbound_email_events' as never)
    .update({ status, reason, result, updated_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) console.error('[inbound-email] event update failed', error);
}

/**
 * Claim this message for processing. Returns the event id, or 'duplicate' when
 * it has already been handled (or is being handled right now).
 */
async function claim(db: Db, row: Row): Promise<{ id: string } | 'duplicate'> {
  const { data, error } = await db.from('inbound_email_events' as never).insert(row as never).select('id').single();
  if (!error && data) return { id: (data as { id: string }).id };
  if ((error as { code?: string } | null)?.code !== '23505') throw error;

  const { data: existing, error: readErr } = await db.from('inbound_email_events' as never)
    .select('id, status, updated_at')
    .eq('provider', 'resend')
    .eq('provider_email_id', row.provider_email_id as string)
    .eq('tenant_id', row.tenant_id as string)
    .maybeSingle();
  if (readErr) throw readErr;
  const ev = existing as { id: string; status: string; updated_at: string } | null;
  if (!ev) return 'duplicate';
  const stale = Date.now() - new Date(ev.updated_at).getTime() > 10 * 60_000;
  // A retry of a message that failed (or died mid-way) is picked up again; anything settled is not.
  if (ev.status === 'failed' || (ev.status === 'processing' && stale)) {
    const { data: re } = await db.from('inbound_email_events' as never)
      .update({ status: 'processing', reason: null, updated_at: new Date().toISOString() } as never)
      .eq('id', ev.id).eq('status', ev.status).select('id');
    return Array.isArray(re) && re.length ? { id: ev.id } : 'duplicate';
  }
  return 'duplicate';
}

/** Download the reply's files and file them on the item, as /api/files/upload does. */
async function storeAttachments(db: Db, emailId: string, tenantId: string, projectId: string, table: string, itemId: string, senderName: string): Promise<{ files: { id: string; name: string; url: string }[]; skipped: string[] }> {
  const files: { id: string; name: string; url: string }[] = [];
  const skipped: string[] = [];
  const list = await resendGet<{ data?: AttachmentLink[] }>(`/emails/receiving/${encodeURIComponent(emailId)}/attachments`);
  const wanted = (list.data || []).filter((a) => {
    const inlineLogo = a.content_disposition === 'inline' && !!a.content_id && String(a.content_type || '').startsWith('image/') && (a.size ?? 0) < INLINE_LOGO_BYTES;
    return !inlineLogo;
  });
  for (const a of wanted.slice(0, MAX_ATTACHMENTS)) {
    const name = String(a.filename || `attachment-${a.id}`).slice(0, 200);
    try {
      if (!a.download_url) { skipped.push(name); continue; }
      if ((a.size ?? 0) > MAX_ATTACHMENT_BYTES) { skipped.push(name); continue; }
      const r = await fetch(a.download_url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`download HTTP ${r.status}`);
      const buffer = Buffer.from(await r.arrayBuffer());
      if (buffer.length > MAX_ATTACHMENT_BYTES) { skipped.push(name); continue; }
      const contentType = a.content_type || 'application/octet-stream';
      const safeName = name.replace(/[^\w.\-() ]+/g, '_');
      const path = `${tenantId}/projects/${projectId}/files/${Date.now()}-${safeName}`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
      if (upErr) throw upErr;
      const publicUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { data: row, error: rowErr } = await (db as any).from('project_files').insert({
        tenant_id: tenantId,
        project_id: projectId,
        file_name: name,
        file_url: publicUrl,
        file_size: buffer.length,
        file_type: contentType,
        mime_type: contentType,
        kind: classifyKind(contentType, safeName),
        storage_bucket: BUCKET,
        storage_path: path,
        category: 'item-attachment',
        entity_type: table,
        entity_id: itemId,
        uploaded_by: null,
        uploaded_by_name: `${senderName} (via email)`,
        is_current: true,
        version_number: 1,
      }).select('id').single();
      if (rowErr) throw rowErr;
      files.push({ id: (row as { id: string }).id, name, url: publicUrl });
    } catch (e) {
      console.error('[inbound-email] attachment failed', name, e);
      skipped.push(name);
    }
  }
  for (const a of wanted.slice(MAX_ATTACHMENTS)) skipped.push(String(a.filename || a.id));
  return { files, skipped };
}

/**
 * Handle one verified webhook event. Never throws: a transient failure comes
 * back as http 500 so Resend retries; every other outcome is a 200 so a
 * rejected message is not retried forever.
 */
export async function handleInboundEmail(event: Row): Promise<InboundOutcome> {
  if (event.type !== 'email.received') return { http: 200, status: 'ignored', reason: 'not_email_received' };
  const secret = (process.env.INBOUND_REPLY_SECRET || '').trim();
  const domain = (process.env.INBOUND_REPLY_DOMAIN || '').trim().toLowerCase();
  if (!secret || !domain) return { http: 200, status: 'ignored', reason: 'not_configured' };

  const data = (event.data || {}) as Row;
  const emailId = String(data.email_id || '');
  const fromBare = normalizeEmail(String(data.from || ''));

  // The webhook is account-wide: mail for other domains and other addresses arrives here too.
  const picked = pickToken(data, domain);
  if ('reason' in picked) {
    if (picked.reason === 'bad_token') console.warn('[inbound-email] rejected: bad_token', { emailId, from: fromBare });
    return picked.reason === 'no_token' ? { http: 200, status: 'ignored', reason: 'no_token' } : { http: 200, status: 'rejected', reason: picked.reason };
  }
  const { token, decoded } = picked;
  if (!emailId) return { http: 200, status: 'rejected', reason: 'no_email_id' };

  // First line of the per-token limit, before any database work.
  if (!checkRateLimit(`inbound-email:${token}`, TOKEN_HOURLY_LIMIT, 60 * 60_000).allowed) {
    console.warn('[inbound-email] rejected: rate_limited (memory)', { item: decoded.itemId, from: fromBare });
    return { http: 200, status: 'rejected', reason: 'rate_limited' };
  }

  const db = createServerClient();
  let eventId: string | null = null;
  try {
    // Token routes: the item is found by the id the token carries; its tenant then checks the MAC.
    const { data: itemRow, error: itemErr } = await db.from(TABLE[decoded.type] as never).select('*').eq('id', decoded.itemId).maybeSingle();
    if (itemErr) throw itemErr;
    const item = itemRow as Row | null;
    const tenantId = String(item?.tenant_id || '');

    // Before the MAC passes nothing is trusted — log only, write nothing.
    if (!item || item.deleted_at) {
      console.warn('[inbound-email] rejected: item_not_found', { emailId, item: decoded.itemId, from: fromBare });
      return { http: 200, status: 'rejected', reason: 'item_not_found' };
    }
    const genuine = verifyReplyToken(secret, decoded, tenantId);
    if (!genuine.ok && genuine.reason === 'bad_signature') {
      console.warn('[inbound-email] rejected: bad_signature', { emailId, item: decoded.itemId, from: fromBare });
      return { http: 200, status: 'rejected', reason: 'bad_signature' };
    }

    const projectId = (item!.project_id as string) || null;
    const claimed = await claim(db, {
      tenant_id: tenantId,
      project_id: projectId,
      provider: 'resend',
      provider_email_id: emailId,
      message_id: (data.message_id as string) || null,
      token_hash: sha256(token),
      item_type: decoded.type,
      item_id: decoded.itemId,
      sender_email: fromBare || null,
      subject: String(data.subject || '').slice(0, 500) || null,
      status: 'processing',
    });
    if (claimed === 'duplicate') return { http: 200, status: 'duplicate' };
    eventId = claimed.id;
    const reject = async (reason: RejectReason | string, extra: Row = {}): Promise<InboundOutcome> => {
      console.warn(`[inbound-email] rejected: ${reason}`, { emailId, tenantId, item: decoded.itemId, from: fromBare, ...extra });
      await setEvent(db, eventId!, 'rejected', reason, extra);
      return { http: 200, status: 'rejected', reason };
    };

    if (!genuine.ok) return reject(genuine.reason);

    // The same message delivered twice under two provider ids (a sender's server retrying).
    if (data.message_id) {
      const { data: dup, error: dupErr } = await db.from('inbound_email_events' as never).select('id')
        .eq('tenant_id', tenantId).eq('item_id', decoded.itemId).eq('message_id', data.message_id as string)
        .eq('status', 'applied').neq('id', eventId).limit(1);
      if (dupErr) throw dupErr;
      if (Array.isArray(dup) && dup.length) {
        await setEvent(db, eventId, 'ignored', 'duplicate_message_id');
        return { http: 200, status: 'duplicate' };
      }
    }

    // Second line of the per-token limit: shared across every server instance.
    const { count, error: countErr } = await db.from('inbound_email_events' as never).select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('token_hash', sha256(token))
      .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString());
    if (countErr) throw countErr;
    if ((count || 0) > TOKEN_HOURLY_LIMIT) return reject('rate_limited');

    const { data: projRow, error: projErr } = projectId
      ? await db.from('projects').select('*').eq('id', projectId).eq('tenant_id', tenantId).maybeSingle()
      : { data: null, error: null };
    if (projErr) throw projErr;
    const project = projRow as Row | null;

    const email = await resendGet<ReceivedEmail>(`/emails/receiving/${encodeURIComponent(emailId)}`);
    const sender = normalizeEmail(String(email.from || fromBare));
    const reply = extractReply({ text: email.text, html: email.html }).slice(0, 10000);
    const attachmentCount = (email.attachments || []).length;

    const screened = screenReply({
      secret, decoded, item, project, sender,
      headers: email.headers, subject: email.subject ?? (data.subject as string), authentication: email.authentication,
      reply, attachmentCount,
    });
    if (!screened.ok) return reject(screened.reason, { sender });

    const headerFrom = String((email.headers as Row | null)?.from || '');
    const name = displayName(headerFrom, sender);
    const author = name === sender ? sender : `${name} <${sender}>`;

    const stored = attachmentCount && projectId
      ? await storeAttachments(db, emailId, tenantId, projectId, TABLE[decoded.type], decoded.itemId, name)
      : { files: [], skipped: [] as string[] };
    if (!reply && stored.files.length === 0) return reject('empty_reply', { sender, skipped: stored.skipped });

    const plan = planReply(decoded.type, item!, { via: screened.via, sender, reply, project });
    const now = new Date().toISOString();
    const result: Row = { via: screened.via, plan, files: stored.files.map((f) => f.id), skipped: stored.skipped };

    // Every reply is on the item's thread (the Comments tab), marked "via email".
    const official = (plan.type === 'rfis' && plan.official) || (plan.type === 'submittals' && !!plan.verdict);
    const { result: { data: comment, error: cErr } } = await writeWithOptionalColumns(
      {
        tenant_id: tenantId,
        project_id: projectId,
        entity_type: TABLE[decoded.type],
        entity_id: decoded.itemId,
        body: reply,
        author_id: null,
        author_name: name,
        attachments: stored.files.map((f) => ({ id: f.id, name: f.name })),
        is_official: official,
        source: 'email',
        source_email: sender,
      },
      ['source', 'source_email'],
      (row) => db.from('entity_comments').insert(row as never).select('id').single(),
    );
    if (cErr) throw cErr;
    result.comment_id = (comment as { id?: string } | null)?.id ?? null;

    if (plan.type === 'rfis') {
      const { result: { error: rErr } } = await writeWithOptionalColumns(
        {
          tenant_id: tenantId,
          rfi_id: decoded.itemId,
          responder_name: name,
          responder_email: sender,
          response_text: reply,
          attachments: stored.files.map((f) => ({ name: f.name, url: f.url })),
          is_official: plan.official,
          responded_at: now,
          source: 'email',
        },
        ['source'],
        (row) => db.from('rfi_responses').insert(row as never).select('id').single(),
      );
      if (rErr) throw rErr;
      if (plan.official) {
        // The same answer /api/rfis/[id]/answer writes, ball back to the requester.
        const ballBack = String(item!.submitted_by || '');
        const { result: { error: aErr } } = await writeWithOptionalColumns(
          {
            answer: reply,
            answered_by: author,
            answered_at: now,
            answered_date: now,
            status: 'answered',
            ...(ballBack ? { ball_in_court: ballBack } : {}),
            last_activity_at: now,
            last_activity_type: 'answered_by_email',
            answer_source: 'email',
          },
          ['answer_source'],
          (row) => db.from('rfis').update(row as never).eq('id', decoded.itemId).eq('tenant_id', tenantId).select('id').single(),
        );
        if (aErr) throw aErr;
        runInBackground(onRFIAnswered(decoded.itemId), 'onRFIAnswered (email)');
      }
    } else if (plan.type === 'submittals' && plan.verdict) {
      // The review the /review route records, plus the stamp and the reviewer's words.
      const { error: sErr } = await db.from('submittals').update({
        status: plan.verdict,
        review_action: VERDICT_LABEL[plan.verdict],
        review_comments: reply,
        reviewer_notes: reply,
        reviewed_by: author,
        reviewed_at: now,
        returned_at: now,
        response_date: now.slice(0, 10),
        ball_in_court: 'Contractor',
        updated_at: now,
      } as never).eq('id', decoded.itemId).eq('tenant_id', tenantId);
      if (sErr) throw sErr;
    }

    // Tell the item's owner (or the company's admins when it has none) in the app.
    const num = itemNumber(decoded.type, item!);
    const label = `${NOUN[decoded.type]}${num ? ` ${decoded.type === 'change_orders' ? '#' : ''}${num}` : ''}`;
    const what = plan.type === 'rfis' && plan.official ? 'answered' : plan.type === 'submittals' && plan.verdict ? `returned (${VERDICT_LABEL[plan.verdict]})` : 'replied to';
    await createNotification(
      tenantId, itemOwner(decoded.type, item!), 'email_reply',
      `${name} ${what} ${label} by email`,
      (reply || `${stored.files.length} file${stored.files.length === 1 ? '' : 's'} attached`).slice(0, 160),
      `${APP_URL}/app/projects/${projectId}/items/${decoded.type}/${decoded.itemId}`,
      projectId || undefined,
    );

    await setEvent(db, eventId, 'applied', null, result);
    return { http: 200, status: 'applied' };
  } catch (e) {
    console.error('[inbound-email] failed', { emailId, item: decoded.itemId }, e);
    if (eventId) await setEvent(db, eventId, 'failed', 'processing_error');
    return { http: 500, status: 'failed', reason: 'processing_error' };
  }
}
