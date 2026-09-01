import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { isPlatformAdmin } from '@/lib/platform-admin';
import { encryptSecret, hasEncryptionKey } from '@/lib/crypto-secrets';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

const APPS = new Set(['microsoft', 'dropbox', 'google', 'box']);

async function requireAdmin(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isPlatformAdmin(user.email)) return { err: NextResponse.json({ error: 'Platform owners only' }, { status: 403 }) };
  return { user };
}

// Save an app's OAuth credentials (encrypted). client_id is stored plainly (not a
// secret) for display; client_secret only ever lives inside the encrypted blob.
export async function PUT(req: NextRequest, { params }: { params: { app: string } }) {
  const { user, err } = await requireAdmin(req);
  if (err) return err;
  if (!APPS.has(params.app)) return NextResponse.json({ error: 'Unknown app' }, { status: 400 });
  if (!hasEncryptionKey()) return NextResponse.json({ error: 'Server encryption key not configured' }, { status: 500 });
  try {
    const { clientId, clientSecret, enabled } = await req.json();
    if (!clientId || !clientSecret) return NextResponse.json({ error: 'Client ID and secret are both required' }, { status: 400 });
    const admin = createServerClient() as any;
    const { error } = await admin.from('platform_integrations').upsert({
      app: params.app, client_id: String(clientId).trim(),
      secret_enc: encryptSecret({ clientId: String(clientId).trim(), clientSecret: String(clientSecret).trim() }),
      enabled: enabled !== false, updated_by: user!.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'app' });
    if (error) throw error;
    return NextResponse.json({ ok: true, app: params.app });
  } catch (e: any) {
    return apiError('platform/integrations/app', e, "Save failed", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { app: string } }) {
  const { err } = await requireAdmin(req);
  if (err) return err;
  const admin = createServerClient() as any;
  const { error } = await admin.from('platform_integrations').delete().eq('app', params.app);
  if (error) return apiError('platform/integrations/app', error, undefined, 500);
  return NextResponse.json({ removed: true });
}
