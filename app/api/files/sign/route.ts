import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

const PUBLIC_MARKER = '/storage/v1/object/public/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Batch-sign private-bucket URLs for client-rendered lists (fleet docs, asset
 * photos, etc.) whose stored value is a PUBLIC url that 400s on a private bucket.
 * Tenant-guarded: a tenant-prefixed path (`<tenantId>/…`) is only signed for that
 * tenant; legacy non-prefixed paths pass through (unguessable ts+name keys).
 * Returns a map keyed by the original URL.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { urls } = (await req.json()) as { urls: string[] };
    if (!Array.isArray(urls)) return NextResponse.json({ error: 'urls[] required' }, { status: 400 });
    const admin = createServerClient();
    const out: Record<string, string> = {};

    await Promise.all(urls.slice(0, 200).map(async (u) => {
      if (typeof u !== 'string' || !u) return;
      const i = u.indexOf(PUBLIC_MARKER);
      if (i < 0) { out[u] = u; return; } // already signed / foreign / bare — leave as-is
      const after = u.slice(i + PUBLIC_MARKER.length); // "<bucket>/<path>"
      const slash = after.indexOf('/');
      if (slash < 0) { out[u] = u; return; }
      const bucket = after.slice(0, slash);
      const path = after.slice(slash + 1);
      const seg0 = path.split('/')[0];
      if (UUID.test(seg0) && seg0 !== user.tenantId) { out[u] = u; return; } // cross-tenant → refuse to sign
      try {
        const { data } = await admin.storage.from(bucket).createSignedUrl(path, 3600);
        out[u] = data?.signedUrl || u;
      } catch { out[u] = u; }
    }));

    return NextResponse.json({ signed: out });
  } catch (err: any) {
    return apiError('files/sign', err, "Sign failed", 500);
  }
}
