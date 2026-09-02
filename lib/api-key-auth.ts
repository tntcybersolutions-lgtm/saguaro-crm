/**
 * lib/api-key-auth.ts
 * -------------------------------------------------------------------------
 * Authenticates an incoming `Authorization: Bearer sk_live_…` request against
 * the `api_keys` table minted by the Integration Hub
 * (app/api/integrations/api-keys/route.ts).
 *
 * The mint route stores keys as:
 *   fullKey   = 'sk_live_' + randomBytes(32).toString('hex')   // 8 + 64 chars
 *   key_hash  = sha256(fullKey) as hex                          // stored
 *   key_prefix = fullKey.slice(0, 12)                           // display only
 *
 * We MUST hash incoming tokens the exact same way (sha256 hex over the full
 * raw key) and compare against `key_hash`. Server-only — never import from a
 * client component (uses the service-role Supabase client).
 * -------------------------------------------------------------------------
 */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';

export type ApiScope = 'read' | 'write' | 'admin';

/** Privilege ranking — a higher-ranked scope satisfies any lower requirement. */
const SCOPE_RANK: Record<string, number> = { read: 1, write: 2, admin: 3 };

export interface ApiKeyAuthOk {
  ok: true;
  tenantId: string;
  scopes: string[];
  keyId: string;
}
export interface ApiKeyAuthFail {
  ok: false;
  status: 401 | 403;
  error: string;
}
export type ApiKeyAuthResult = ApiKeyAuthOk | ApiKeyAuthFail;

/** Pull the raw Bearer token from the Authorization header, or null. */
function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/**
 * True if the token is shaped like a minted Saguaro secret key:
 * `sk_live_` followed by 64 lowercase hex chars (32 random bytes).
 * Lets callers cheaply distinguish an API key from a Supabase session JWT.
 */
export function looksLikeApiKey(token: string): boolean {
  return /^sk_live_[0-9a-f]{64}$/.test(token);
}

/** Hash a raw key the SAME way the mint route does: sha256 hex over the full key. */
export function hashApiKey(fullKey: string): string {
  return createHash('sha256').update(fullKey).digest('hex');
}

/** Does the key's scope set satisfy the required scope? (admin ⊇ write ⊇ read) */
function scopeSatisfied(scopes: string[], required?: ApiScope): boolean {
  if (!required) return true;
  const need = SCOPE_RANK[required] ?? 1;
  const have = scopes.reduce((max, s) => Math.max(max, SCOPE_RANK[s] ?? 0), 0);
  return have >= need;
}

/**
 * Authenticate a request's Bearer token against `api_keys`.
 * Resolves to the key's tenant + scopes on success, or a typed failure.
 * Best-effort bumps `last_used_at` (never fails the request if that write errors).
 */
export async function authenticateApiKey(req: NextRequest): Promise<ApiKeyAuthResult> {
  const token = extractBearer(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization: Bearer <api key>' };
  }
  if (!looksLikeApiKey(token)) {
    return { ok: false, status: 401, error: 'Invalid API key format' };
  }

  const keyHash = hashApiKey(token);

  let data: { id: string; tenant_id: string; scopes: string[] | null; revoked_at: string | null } | null = null;
  try {
    const db = createServerClient();
    const res = await db
      .from('api_keys')
      .select('id, tenant_id, scopes, revoked_at')
      .eq('key_hash', keyHash)
      .maybeSingle();
    if (res.error) throw res.error;
    data = res.data;
  } catch {
    return { ok: false, status: 401, error: 'Authentication failed' };
  }

  if (!data) return { ok: false, status: 401, error: 'Invalid API key' };
  if (data.revoked_at) return { ok: false, status: 401, error: 'API key has been revoked' };

  // Best-effort last-used bump — swallow any failure so it never blocks auth.
  try {
    const db = createServerClient();
    await must(db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id), 'api_keys update');
  } catch {
    /* ignore — telemetry only */
  }

  return { ok: true, tenantId: data.tenant_id, scopes: data.scopes ?? [], keyId: data.id };
}

export type RequireApiKeyResult =
  | { ok: true; tenantId: string; scopes: string[]; keyId: string }
  | { ok: false; response: NextResponse };

/**
 * Route-handler guard. On success returns the auth context; on failure returns
 * a ready-to-send NextResponse (401 unauthenticated / 403 insufficient scope).
 *
 *   const auth = await requireApiKey(req, 'read');
 *   if (!auth.ok) return auth.response;
 *   // ...use auth.tenantId
 */
export async function requireApiKey(req: NextRequest, scope?: ApiScope): Promise<RequireApiKeyResult> {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: auth.error },
        { status: auth.status, headers: { 'WWW-Authenticate': 'Bearer realm="Saguaro API"' } },
      ),
    };
  }
  if (!scopeSatisfied(auth.scopes, scope)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Insufficient scope — '${scope}' required`, scopes: auth.scopes },
        { status: 403 },
      ),
    };
  }
  return { ok: true, tenantId: auth.tenantId, scopes: auth.scopes, keyId: auth.keyId };
}
