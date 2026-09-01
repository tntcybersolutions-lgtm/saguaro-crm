import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { makeProvider, loadConnectorCtx } from '@/lib/storage-providers/registry';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Browse a folder in the external store. ?path= a provider-native folder locator.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await loadConnectorCtx(params.id, user.tenantId);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const path = new URL(req.url).searchParams.get('path');
    const provider = await makeProvider(ctx);
    const result = await provider.list(path);
    // sort folders first, then by name
    result.items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1));
    return NextResponse.json(result);
  } catch (err: any) {
    return apiError('storage/connectors/id/browse', err, "Could not browse this connection", 502);
  }
}
