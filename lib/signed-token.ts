import { createHmac, timingSafeEqual } from 'crypto';

/* HMAC-signed, expiring, purpose-scoped tokens.
 *
 * Used where a link in an email has to prove something about its recipient
 * without a session — unsubscribe, account deletion confirmation. The subject
 * (normally an email address) is carried inside the token, so no lookup table
 * is needed to resolve it.
 *
 * The purpose is part of the signed payload, so a token minted for one flow
 * cannot be replayed against another.
 */

export const DAY_MS = 86_400_000;

function secret(): string {
  const s = process.env.SAGUARO_API_SECRET;
  if (!s) throw new Error('SAGUARO_API_SECRET is not configured');
  return s;
}

const b64url = (b: Buffer) => b.toString('base64url');

/** Signs `subject` for `purpose`, valid for `ttlMs` from now. */
export function signToken(purpose: string, subject: string, ttlMs: number): string {
  const exp = Date.now() + ttlMs;
  const payload = b64url(Buffer.from(`${purpose}|${subject.toLowerCase()}|${exp}`));
  const sig = b64url(createHmac('sha256', secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

/**
 * Returns the subject the token attests to, or null if the signature is wrong,
 * the purpose does not match, or it has expired.
 */
export function verifyToken(purpose: string, token: string | null | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = b64url(createHmac('sha256', secret()).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString();
  } catch {
    return null;
  }

  const [tokenPurpose, subject, expStr] = decoded.split('|');
  if (tokenPurpose !== purpose) return null;
  if (!subject || !expStr) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;

  return subject;
}
