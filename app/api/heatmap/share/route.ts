import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { heatmapShareToken, newShareNonce, SHARE_TTL_MS } from '@/lib/heatmap/share';

export const runtime = 'nodejs';

/**
 * GET /api/heatmap/share?id=  → mint (or reuse) a read-only share URL (owner-only).
 * Reuses the current link while it's still valid; regenerates only if none exists or it
 * has expired. The returned URL carries both the token (t) and its expiry (e).
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heatmap_designs not yet in generated DB types
  const supabase = createServerClient() as any;

  const { data: row, error } = await supabase
    .from('heatmap_designs')
    .select('id, share_nonce, share_expires_at')
    .eq('id', id)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !row) return Response.json({ error: 'Design not found' }, { status: 404 });

  const now = Date.now();
  let nonce: string | null = row.share_nonce;
  let expMs = row.share_expires_at ? Date.parse(row.share_expires_at) : 0;
  if (!nonce || !expMs || expMs <= now) {
    nonce = newShareNonce();
    expMs = now + SHARE_TTL_MS;
    const { error: upErr } = await supabase
      .from('heatmap_designs')
      .update({ share_nonce: nonce, share_expires_at: new Date(expMs).toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (upErr) return Response.json({ error: 'Could not create share link' }, { status: 500 });
  }

  const token = heatmapShareToken(id, nonce as string, expMs);
  const path = `/share/heatmap/${id}?t=${token}&e=${expMs}`;
  return Response.json({ token, path, url: `${new URL(req.url).origin}${path}`, expiresAt: new Date(expMs).toISOString() });
}

/** DELETE /api/heatmap/share?id=  → revoke every share link for a design (owner-only). */
export async function DELETE(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heatmap_designs not yet in generated DB types
  const supabase = createServerClient() as any;
  const { data, error } = await supabase
    .from('heatmap_designs')
    .update({ share_nonce: null, share_expires_at: null })
    .eq('id', id)
    .eq('tenant_id', user.tenantId)
    .select('id')
    .single();
  if (error || !data) return Response.json({ error: 'Design not found' }, { status: 404 });
  return Response.json({ revoked: true });
}
