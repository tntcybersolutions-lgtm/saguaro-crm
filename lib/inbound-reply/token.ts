/**
 * Reply-by-email addresses: `reply+<token>@<INBOUND_REPLY_DOMAIN>`.
 *
 * Every email Saguaro sends about an RFI, a submittal or a change order can
 * carry its own Reply-To. When the architect / engineer / owner hits Reply,
 * the answer lands on our inbound webhook (app/api/inbound/email) and the
 * token says which item it belongs to — no login.
 *
 * The token is HMAC-signed over {tenant, item type, item id, recipient,
 * expiry}. An address local part is capped at 64 characters (RFC 5321), so the
 * token carries only what cannot be looked up and binds the rest:
 *
 *   byte  0       version (high nibble) | item type (low nibble)
 *   bytes 1..16   item id (the UUID's 16 bytes)
 *   bytes 17..19  expiry, whole hours since 2026-01-01 UTC
 *   bytes 20..23  recipient fingerprint = HMAC(secret, email)[0..4]
 *   bytes 24..31  MAC = HMAC(secret, tenant id + bytes 0..23)[0..8]
 *
 * 32 bytes → 52 characters of lowercase base32, so `reply+` + token is 58
 * characters. Base32 because mail systems are free to change the case of a
 * local part; base64 would break.
 *
 * The tenant is not in the token: the webhook loads the item by id and checks
 * the MAC with THAT item's tenant, so a token can never be pointed at another
 * company's record. The recipient is not in the token either: the sender's
 * address is fingerprinted and compared, so a reply from anyone other than the
 * person the email went to does not match (they can still be let in by being
 * on the item's distribution — lib/inbound-reply/match).
 *
 * Pure: node:crypto only, so the sanity tests run it directly.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type ReplyItemType = 'rfis' | 'submittals' | 'change_orders';

const TYPE_CODE: Record<ReplyItemType, number> = { rfis: 1, submittals: 2, change_orders: 3 };
const CODE_TYPE: Record<number, ReplyItemType> = { 1: 'rfis', 2: 'submittals', 3: 'change_orders' };
const VERSION = 1;
const EPOCH_MS = Date.UTC(2026, 0, 1);
const HOUR_MS = 3_600_000;
/** RFIs and submittals stay open for months; a reply a season later should still land. */
export const REPLY_TOKEN_TTL_DAYS = 180;

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
export const TOKEN_LENGTH = 52;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer | null {
  const str = s.toLowerCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of str) {
    const idx = B32.indexOf(ch);
    if (idx < 0) return null;
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function normalizeEmail(email: string): string {
  const s = String(email || '').trim();
  const angle = s.match(/<([^>]+)>/);
  return (angle ? angle[1] : s).trim().toLowerCase();
}

function hmac(secret: string, ...parts: (string | Uint8Array)[]): Buffer {
  const h = createHmac('sha256', secret);
  for (const p of parts) h.update(p);
  return h.digest();
}

/** First 4 bytes of HMAC(secret, email): binds the token to one recipient without carrying the address. */
export function recipientFingerprint(secret: string, email: string): Buffer {
  return hmac(secret, 'rcpt\u0000', normalizeEmail(email)).subarray(0, 4);
}

function mac(secret: string, tenantId: string, body: Uint8Array): Buffer {
  return hmac(secret, 'reply\u0000', String(tenantId).toLowerCase(), '\u0000', body).subarray(0, 8);
}

export type ReplyTokenInput = {
  tenantId: string;
  type: ReplyItemType;
  itemId: string;
  recipient: string;
  /** Defaults to now + REPLY_TOKEN_TTL_DAYS. */
  expiresAt?: Date;
};

export function signReplyToken(secret: string, input: ReplyTokenInput, now: Date = new Date()): string {
  if (!secret) throw new Error('signReplyToken: secret is required');
  if (!UUID.test(input.itemId)) throw new Error('signReplyToken: itemId must be a UUID');
  if (!UUID.test(input.tenantId)) throw new Error('signReplyToken: tenantId must be a UUID');
  const code = TYPE_CODE[input.type];
  if (!code) throw new Error(`signReplyToken: unknown item type ${input.type}`);
  if (!normalizeEmail(input.recipient).includes('@')) throw new Error('signReplyToken: recipient must be an email');

  const exp = input.expiresAt ?? new Date(now.getTime() + REPLY_TOKEN_TTL_DAYS * 86_400_000);
  const hours = Math.min(0xffffff, Math.max(0, Math.ceil((exp.getTime() - EPOCH_MS) / HOUR_MS)));

  const body = Buffer.alloc(24);
  body[0] = (VERSION << 4) | code;
  Buffer.from(input.itemId.replace(/-/g, ''), 'hex').copy(body, 1);
  body[17] = (hours >>> 16) & 255;
  body[18] = (hours >>> 8) & 255;
  body[19] = hours & 255;
  recipientFingerprint(secret, input.recipient).copy(body, 20);

  return base32Encode(Buffer.concat([body, mac(secret, input.tenantId, body)]));
}

export type DecodedReplyToken = {
  type: ReplyItemType;
  itemId: string;
  expiresAt: Date;
  /** Kept for verification; not to be trusted until verifyReplyToken passes. */
  body: Buffer;
  fingerprint: Buffer;
  mac: Buffer;
};

/** Parses the token's shape. Says nothing about whether it is genuine — see verifyReplyToken. */
export function decodeReplyToken(token: string): DecodedReplyToken | null {
  if (!token || token.length !== TOKEN_LENGTH) return null;
  const raw = base32Decode(token);
  if (!raw || raw.length !== 32) return null;
  const version = raw[0] >>> 4;
  const type = CODE_TYPE[raw[0] & 15];
  if (version !== VERSION || !type) return null;
  const hex = raw.subarray(1, 17).toString('hex');
  const itemId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const hours = (raw[17] << 16) | (raw[18] << 8) | raw[19];
  return {
    type,
    itemId,
    expiresAt: new Date(EPOCH_MS + hours * HOUR_MS),
    body: raw.subarray(0, 24),
    fingerprint: raw.subarray(20, 24),
    mac: raw.subarray(24, 32),
  };
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'bad_signature' | 'expired' };

/** Genuine for this tenant (the item's own tenant) and not expired. */
export function verifyReplyToken(secret: string, decoded: DecodedReplyToken, tenantId: string, now: Date = new Date()): VerifyResult {
  const expect = mac(secret, tenantId, decoded.body);
  if (expect.length !== decoded.mac.length || !timingSafeEqual(expect, decoded.mac)) return { ok: false, reason: 'bad_signature' };
  if (decoded.expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true };
}

/** Is `email` the person this token was issued to? */
export function isTokenRecipient(secret: string, decoded: DecodedReplyToken, email: string): boolean {
  const fp = recipientFingerprint(secret, email);
  return timingSafeEqual(fp, decoded.fingerprint);
}

/** `reply+<token>@<domain>`, or null when reply-by-email is not configured (keeps today's Reply-To). */
export function buildReplyAddress(
  input: ReplyTokenInput,
  env: { secret?: string | null; domain?: string | null } = {
    secret: process.env.INBOUND_REPLY_SECRET,
    domain: process.env.INBOUND_REPLY_DOMAIN,
  },
): string | null {
  const secret = (env.secret || '').trim();
  const domain = (env.domain || '').trim().toLowerCase().replace(/^@/, '');
  if (!secret || !domain) return null;
  try {
    return `reply+${signReplyToken(secret, input)}@${domain}`;
  } catch (e) {
    console.error('[inbound-reply] could not build a reply address', e);
    return null;
  }
}

/** Tokens found among the addresses a message was sent to, for our inbound domain only. */
export function findReplyTokens(addresses: (string | null | undefined)[], domain: string): string[] {
  const d = String(domain || '').trim().toLowerCase().replace(/^@/, '');
  if (!d) return [];
  const out = new Set<string>();
  for (const a of addresses) {
    if (!a) continue;
    for (const part of String(a).split(',')) {
      const addr = normalizeEmail(part);
      const m = addr.match(/^reply\+([a-z2-7]+)@(.+)$/);
      if (m && m[2] === d && m[1].length === TOKEN_LENGTH) out.add(m[1]);
    }
  }
  return [...out];
}
