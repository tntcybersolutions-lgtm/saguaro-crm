/**
 * The communications record: every email Saguaro sends about a job or a bid
 * package, written where it is sent, so a bid jacket carries the whole
 * conversation (invites, reminders, addenda, award notices), not only the
 * documents.
 *
 * Callers don't thread a logger through every send function. They say what the
 * mail is about once:
 *
 *   await withComm({ tenantId, projectId, bidPackageId, subId, relatedType: 'bid_invite' },
 *     () => sendSubInvitedToBid(...));
 *
 * and lib/email's send() records itself — to, subject, the text of the body,
 * and whether it really went (sent / failed / not_sent when email isn't set
 * up). A failed write here is logged and never fails the send itself: the mail
 * already left.
 *
 * Server only (node:async_hooks).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServerClient } from '@/lib/supabase-server';

export interface CommContext {
  tenantId: string;
  projectId?: string | null;
  bidPackageId?: string | null;
  subId?: string | null;
  /** bid_invite | bid_reminder | addendum | bid_award | bid_not_awarded | bid_received | … */
  relatedType?: string | null;
  relatedId?: string | null;
  /** Who it is to, by name, when the caller knows it (the address comes from the send). */
  toName?: string | null;
  fromName?: string | null;
  createdBy?: string | null;
}

const store = new AsyncLocalStorage<CommContext>();

/** Run `fn` with every email it sends recorded against `ctx`. */
export function withComm<T>(ctx: CommContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

export function currentComm(): CommContext | undefined {
  return store.getStore();
}

/** An email body as plain text: tags out, links kept as "text (address)", entities decoded, whitespace tidied, capped. */
export function htmlToText(html: string, max = 8000): string {
  const text = String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // Which link the recipient got is part of the record (a reminder's bid link).
    .replace(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return /^(mailto:|#)/i.test(href) || label === href ? label || href : `${label} (${href})`;
    })
    // Inline emphasis carries no break: "<strong>Acme</strong>'s jobs" reads
    // "Acme's jobs", not "Acme 's jobs" (live QA D18).
    .replace(/<\/?(strong|b|em|i|u|span|small|code)\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface CommEntry {
  channel?: 'email' | 'portal_message' | 'sms';
  direction?: 'out' | 'in';
  to: string | string[];
  subject?: string | null;
  body?: string | null;
  status: 'sent' | 'failed' | 'not_sent';
  error?: string | null;
}

/** Write one record under the current (or given) context. Never throws. */
export async function logComm(entry: CommEntry, ctx: CommContext | undefined = currentComm()): Promise<void> {
  if (!ctx?.tenantId) return;
  try {
    const to = Array.isArray(entry.to) ? entry.to.join(', ') : entry.to;
    const { error } = await createServerClient().from('communication_log').insert({
      tenant_id: ctx.tenantId,
      project_id: ctx.projectId ?? null,
      bid_package_id: ctx.bidPackageId ?? null,
      sub_id: ctx.subId ?? null,
      channel: entry.channel ?? 'email',
      direction: entry.direction ?? 'out',
      to_address: to?.slice(0, 500) ?? null,
      to_name: ctx.toName ?? null,
      from_name: ctx.fromName ?? null,
      subject: entry.subject?.slice(0, 500) ?? null,
      body: entry.body ?? null,
      status: entry.status,
      error: entry.error?.slice(0, 500) ?? null,
      related_type: ctx.relatedType ?? null,
      related_id: ctx.relatedId ?? null,
      created_by: ctx.createdBy ?? null,
    } as never);
    if (error) throw error;
  } catch (e) {
    console.error('[comm-log] not recorded', ctx.relatedType, entry.subject, e);
  }
}
