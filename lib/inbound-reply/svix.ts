/**
 * Resend signs its webhooks with Svix. This is the Svix check, written out so
 * we do not add the svix package for one HMAC:
 *
 *   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
 *   key            = base64-decode(secret without its "whsec_" prefix)
 *   signature      = base64(HMAC-SHA256(key, signed content))
 *
 * `svix-signature` is a space-separated list of `v1,<signature>` (several
 * while a secret is being rotated). The timestamp must be within five minutes
 * of now, so a captured request cannot be replayed later.
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 *
 * The body MUST be the raw request text: re-serialized JSON changes the bytes
 * and the signature no longer matches.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export type SvixResult = { ok: true } | { ok: false; reason: 'missing_headers' | 'no_secret' | 'stale_timestamp' | 'bad_signature' };

function secretKey(secret: string): Buffer {
  const s = secret.trim();
  return Buffer.from(s.startsWith('whsec_') ? s.slice(6) : s, 'base64');
}

export function svixSign(secret: string, id: string, timestamp: string, body: string): string {
  return createHmac('sha256', secretKey(secret)).update(`${id}.${timestamp}.${body}`).digest('base64');
}

export function verifySvix(secret: string | null | undefined, headers: SvixHeaders, body: string, nowMs: number = Date.now()): SvixResult {
  if (!secret || !secret.trim()) return { ok: false, reason: 'no_secret' };
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > SVIX_TOLERANCE_SECONDS) return { ok: false, reason: 'stale_timestamp' };

  const expected = Buffer.from(svixSign(secret, id, timestamp, body), 'base64');
  for (const part of signature.split(' ')) {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) continue;
    const got = Buffer.from(sig, 'base64');
    if (got.length === expected.length && timingSafeEqual(got, expected)) return { ok: true };
  }
  return { ok: false, reason: 'bad_signature' };
}
