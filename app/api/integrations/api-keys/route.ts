import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/* ------------------------------------------------------------------ */
/*  /api/integrations/api-keys                                        */
/*  GET  → list this tenant's API keys (NEVER returns key_hash)       */
/*  POST → create a key; returns the FULL key ONCE (create-only)      */
/* ------------------------------------------------------------------ */

const VALID_SCOPES = ['read', 'write', 'admin'];

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('api_keys')
      .select('id, name, key_prefix, scopes, last_used_at, revoked_at, created_at')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ keys: data ?? [] });
  } catch (e) {
    return apiError('integrations/api-keys GET', e);
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    let scopes: string[] = Array.isArray(body.scopes)
      ? body.scopes.filter((s: unknown): s is string => typeof s === 'string' && VALID_SCOPES.includes(s))
      : [];
    if (scopes.length === 0) scopes = ['read'];

    // Generate the secret: sk_live_ + 32 random bytes (64 hex chars).
    const fullKey = 'sk_live_' + randomBytes(32).toString('hex');
    const keyPrefix = fullKey.slice(0, 12);
    const keyHash = createHash('sha256').update(fullKey).digest('hex');

    const db = createServerClient();
    const { data, error } = await db
      .from('api_keys')
      .insert({
        tenant_id: user.tenantId,
        created_by: user.id,
        name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes,
      })
      .select('id, name, key_prefix, scopes, last_used_at, revoked_at, created_at')
      .single();

    if (error) throw error;

    // Return the full key exactly ONCE — it is never retrievable again.
    return NextResponse.json({ key: data, secret: fullKey }, { status: 201 });
  } catch (e) {
    return apiError('integrations/api-keys POST', e);
  }
}
