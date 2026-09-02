import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { makeProvider, loadConnectorCtx } from '@/lib/storage-providers/registry';
import { must, tryWrite } from '@/lib/db-write';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Re-verify a stored connector's credentials and record the result.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await loadConnectorCtx(params.id, user.tenantId);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const admin = createServerClient() as any;
  try {
    const provider = await makeProvider(ctx);
    const t = await provider.test();
    await must(admin.from('storage_connectors').update({
      status: t.ok ? 'connected' : 'error', last_error: t.ok ? null : (t.error || 'test failed'),
      last_verified_at: t.ok ? new Date().toISOString() : undefined, updated_at: new Date().toISOString(),
    }).eq('id', params.id).eq('tenant_id', user.tenantId), 'storage_connectors update');
    return NextResponse.json({ ok: t.ok, account: t.account, error: t.error });
  } catch (err: any) {
    await tryWrite(admin.from('storage_connectors').update({ status: 'error', last_error: err?.message || 'test failed', updated_at: new Date().toISOString() }).eq('id', params.id).eq('tenant_id', user.tenantId), 'storage_connectors update');
    /* last_error above keeps the real reason on the connector row, where an
       admin can read it. The response says only that it failed. */
    console.error('[storage/connectors/test]', err);
    return NextResponse.json({ ok: false, error: 'Connection test failed. Check the connector settings.' });
  }
}
