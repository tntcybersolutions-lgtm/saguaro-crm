import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { encryptSecret } from '@/lib/crypto-secrets';
import { makeProvider, loadConnectorCtx } from '@/lib/storage-providers/registry';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

const redact = (r: any) => ({ id: r.id, provider: r.provider, display_name: r.display_name, status: r.status, config: r.config, root_path: r.root_path, last_verified_at: r.last_verified_at, last_error: r.last_error, connected: r.status === 'connected', has_secret: !!r.secret_enc });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createServerClient() as any;
  const { data } = await admin.from('storage_connectors').select('*').eq('id', params.id).eq('tenant_id', user.tenantId).single();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ connector: redact(data) });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const admin = createServerClient() as any;
    const patch: any = { updated_at: new Date().toISOString() };
    if (typeof body.display_name === 'string') patch.display_name = body.display_name;
    if (typeof body.root_path === 'string') patch.root_path = body.root_path || null;
    if (body.config && typeof body.config === 'object') patch.config = body.config;

    // If new secret/config supplied, re-verify then re-encrypt.
    if (body.secret && typeof body.secret === 'object') {
      const ctx = await loadConnectorCtx(params.id, user.tenantId);
      if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const provider = await makeProvider({ ...ctx, config: patch.config || ctx.config, secret: body.secret, rootPath: patch.root_path ?? ctx.rootPath });
      const t = await provider.test();
      if (!t.ok) return NextResponse.json({ error: t.error || 'Credentials failed verification' }, { status: 400 });
      patch.secret_enc = encryptSecret(body.secret);
      patch.status = 'connected'; patch.last_verified_at = new Date().toISOString(); patch.last_error = null;
    }
    const { data, error } = await admin.from('storage_connectors').update(patch).eq('id', params.id).eq('tenant_id', user.tenantId).select('*').single();
    if (error) throw error;
    return NextResponse.json({ connector: redact(data) });
  } catch (err: any) {
    return apiError('storage/connectors/id', err, "Update failed", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createServerClient() as any;
  const { error } = await admin.from('storage_connectors').delete().eq('id', params.id).eq('tenant_id', user.tenantId);
  if (error) return apiError('storage/connectors/id', error, undefined, 500);
  return NextResponse.json({ deleted: true });
}
