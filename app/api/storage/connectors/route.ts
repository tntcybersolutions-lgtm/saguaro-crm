import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { encryptSecret, hasEncryptionKey } from '@/lib/crypto-secrets';
import { makeProvider, ctxFromParts } from '@/lib/storage-providers/registry';
import { PROVIDER_META, type ProviderId } from '@/lib/storage-providers/types';
import { isOAuthProvider } from '@/lib/storage-providers/oauth';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Never leak secrets. Return only non-secret fields + whether a secret is stored.
const redact = (r: any) => ({
  id: r.id, provider: r.provider, display_name: r.display_name, status: r.status,
  config: r.config, root_path: r.root_path, capabilities: r.capabilities,
  last_verified_at: r.last_verified_at, last_error: r.last_error, created_at: r.created_at,
  connected: r.status === 'connected', has_secret: !!r.secret_enc,
});

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createServerClient() as any;
  const { data } = await admin.from('storage_connectors').select('*').eq('tenant_id', user.tenantId).neq('status', 'deleted').order('created_at', { ascending: false });
  return NextResponse.json({ connectors: (data || []).map(redact) });
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasEncryptionKey()) return NextResponse.json({ error: 'Server storage encryption key is not configured.' }, { status: 500 });
  try {
    const body = await req.json();
    const provider = body.provider as ProviderId;
    if (!PROVIDER_META[provider]) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    if (isOAuthProvider(provider)) return NextResponse.json({ error: 'Connect this provider via the OAuth flow (/api/storage/oauth/' + provider + '/start).' }, { status: 400 });

    const config = body.config || {};
    const secret = body.secret || {};
    const rootPath = body.root_path || null;

    // Verify the credentials BEFORE storing anything.
    const provider_ = await makeProvider(ctxFromParts(provider, user.tenantId, config, secret, rootPath));
    const t = await provider_.test();
    if (!t.ok) return NextResponse.json({ error: t.error || 'Could not connect with those credentials.' }, { status: 400 });

    const admin = createServerClient() as any;
    const { data, error } = await admin.from('storage_connectors').insert({
      tenant_id: user.tenantId, provider, display_name: body.display_name || `${PROVIDER_META[provider].label}${t.account ? ` — ${t.account}` : ''}`,
      status: 'connected', config, secret_enc: encryptSecret(secret), root_path: rootPath,
      last_verified_at: new Date().toISOString(), created_by: user.id,
    }).select('*').single();
    if (error) throw error;
    return NextResponse.json({ connector: redact(data), account: t.account });
  } catch (err: any) {
    return apiError('storage/connectors', err, "Failed to create connector", 500);
  }
}
