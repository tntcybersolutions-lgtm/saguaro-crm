/**
 * The webhook's decisions, as pure functions the sanity tests can drive end to
 * end with real signed tokens: which token a message carries, whether the
 * token is genuine for the item it names, whether the sender may post, and
 * what posting does to the item.
 */
import { decodeReplyToken, findReplyTokens, isTokenRecipient, verifyReplyToken, normalizeEmail, type DecodedReplyToken, type ReplyItemType } from './token';
import { authenticationFailed, isAutoReply, itemDistribution, matchSender } from './match';
import { parseSubmittalVerdict, type SubmittalVerdict } from './quote-strip';

type Row = Record<string, unknown>;

export type RejectReason =
  | 'no_token' | 'bad_token' | 'item_not_found' | 'bad_signature' | 'expired'
  | 'auto_reply' | 'spoofed' | 'sender_not_allowed' | 'empty_reply' | 'rate_limited';

/** The addresses an email.received event was delivered to (to, cc, bcc, received_for). */
export function deliveredTo(data: Row | null | undefined): string[] {
  const out: string[] = [];
  for (const k of ['to', 'cc', 'bcc', 'received_for']) {
    const v = data?.[k];
    if (Array.isArray(v)) {
      for (const a of v) if (typeof a === 'string') out.push(a);
    } else if (typeof v === 'string') {
      out.push(v);
    }
  }
  return out;
}

/** First reply token addressed to our inbound domain, decoded (not yet trusted). */
export function pickToken(data: Row | null | undefined, domain: string): { token: string; decoded: DecodedReplyToken } | { reason: 'no_token' | 'bad_token' } {
  const tokens = findReplyTokens(deliveredTo(data), domain);
  if (!tokens.length) return { reason: 'no_token' };
  for (const token of tokens) {
    const decoded = decodeReplyToken(token);
    if (decoded) return { token, decoded };
  }
  return { reason: 'bad_token' };
}

export type ScreenInput = {
  secret: string;
  decoded: DecodedReplyToken;
  /** The item the token names, loaded by id (null when gone or deleted). */
  item: Row | null;
  project?: Row | null;
  sender: string;
  headers?: Record<string, unknown> | null;
  subject?: string | null;
  authentication?: { spf?: string | null; dkim?: string | null; dmarc?: string | null } | null;
  reply: string;
  attachmentCount: number;
  now?: Date;
};

export type ScreenResult =
  | { ok: true; via: 'recipient' | 'distribution'; tenantId: string }
  | { ok: false; reason: RejectReason };

/** Every check between "a message arrived" and "write it on the item". Order matters: cheapest and most certain first. */
export function screenReply(i: ScreenInput): ScreenResult {
  if (!i.item || i.item.deleted_at) return { ok: false, reason: 'item_not_found' };
  const tenantId = String(i.item.tenant_id || '');
  const v = verifyReplyToken(i.secret, i.decoded, tenantId, i.now);
  if (!v.ok) return { ok: false, reason: v.reason };
  if (isAutoReply(i.headers, i.subject)) return { ok: false, reason: 'auto_reply' };
  if (authenticationFailed(i.authentication)) return { ok: false, reason: 'spoofed' };
  const sender = normalizeEmail(i.sender);
  const m = matchSender({
    sender,
    isRecipient: !!sender && isTokenRecipient(i.secret, i.decoded, sender),
    distribution: itemDistribution(i.decoded.type, i.item, i.project),
  });
  if (!m.ok) return { ok: false, reason: 'sender_not_allowed' };
  if (!i.reply.trim() && i.attachmentCount === 0) return { ok: false, reason: 'empty_reply' };
  return { ok: true, via: m.via, tenantId };
}

const RFI_DONE = new Set(['answered', 'closed', 'void', 'voided', 'cancelled', 'canceled']);
const SUBMITTAL_IN_REVIEW = new Set(['pending', 'submitted', 'under_review', 'in_review']);

export type ReplyPlan =
  | { type: 'rfis'; official: boolean }
  | { type: 'submittals'; verdict: SubmittalVerdict | null }
  | { type: 'change_orders' };

/**
 * What the reply does beyond the comment every reply becomes.
 *   RFI        — the official answer (RFI marked answered, ball back to the
 *                requester) when the RFI is still open and the sender is the
 *                one it was sent to answer: the token's recipient, the
 *                assignee or the job's architect. Otherwise a response on the
 *                thread.
 *   Submittal  — a review decision only when the first line is a standard
 *                stamp ("Approved as noted", "Revise and resubmit"…) and the
 *                submittal is in review. Otherwise a reviewer comment.
 *   CO         — a comment.
 */
export function planReply(type: ReplyItemType, item: Row, opts: { via: 'recipient' | 'distribution'; sender: string; reply: string; project?: Row | null }): ReplyPlan {
  if (type === 'rfis') {
    const open = !RFI_DONE.has(String(item.status || '').toLowerCase());
    const s = normalizeEmail(opts.sender);
    const designated = opts.via === 'recipient'
      || s === normalizeEmail(String(item.assigned_to_email || ''))
      || s === normalizeEmail(String(opts.project?.architect_email || ''));
    return { type, official: open && designated && !!opts.reply.trim() };
  }
  if (type === 'submittals') {
    const inReview = SUBMITTAL_IN_REVIEW.has(String(item.status || '').toLowerCase());
    return { type, verdict: inReview ? parseSubmittalVerdict(opts.reply) : null };
  }
  return { type: 'change_orders' };
}

export const VERDICT_LABEL: Record<SubmittalVerdict, string> = {
  approved: 'Approved',
  approved_as_noted: 'Approved as noted',
  revise_resubmit: 'Revise and resubmit',
  rejected: 'Rejected',
};
