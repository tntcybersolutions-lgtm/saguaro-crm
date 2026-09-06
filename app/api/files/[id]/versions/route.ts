import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/files/[id]/versions
 *
 * The full revision history for one file, newest first.
 *
 * Versions are a linked list: each row points at the one it replaced through
 * supersedes_file_id. Given any row in that list — current or superseded — this
 * walks backwards to the original and forwards to the live copy, so opening the
 * history from an old revision shows the same chain as opening it from the new
 * one. A sub who priced revision 2 and a PM looking at revision 5 are then
 * reading one list, not two.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const db = createServerClient();

    const SELECT =
      'id, project_id, file_name, file_url, file_size, file_type, mime_type, category, folder, ' +
      'uploaded_by_name, created_at, version_number, supersedes_file_id, is_current, kind, ' +
      'storage_bucket, storage_path, file_hash, deleted_at';

    const { data: seed, error: seedErr } = await db
      .from('project_files')
      .select(SELECT)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (seedErr) throw seedErr;
    if (!seed) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    const chain = new Map<string, Record<string, any>>();
    chain.set(String((seed as any).id), seed as Record<string, any>);

    /* Backwards: follow supersedes_file_id to the original upload. Bounded so a
       cycle from a bad backfill cannot spin the request forever. */
    let cursor = (seed as any).supersedes_file_id as string | null;
    for (let hops = 0; cursor && hops < 200; hops++) {
      if (chain.has(String(cursor))) break;
      const { data: prev, error } = await db
        .from('project_files')
        .select(SELECT)
        .eq('id', cursor)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      if (error) throw error;
      if (!prev) break;
      chain.set(String((prev as any).id), prev as Record<string, any>);
      cursor = (prev as any).supersedes_file_id as string | null;
    }

    /* Forwards: whatever names a row in the chain as the one it superseded. */
    for (let hops = 0; hops < 200; hops++) {
      const ids = [...chain.keys()];
      const { data: next, error } = await db
        .from('project_files')
        .select(SELECT)
        .eq('tenant_id', user.tenantId)
        .in('supersedes_file_id', ids);
      if (error) throw error;
      const fresh = (next || []).filter((r: any) => !chain.has(String(r.id)));
      if (fresh.length === 0) break;
      for (const r of fresh) chain.set(String((r as any).id), r as Record<string, any>);
    }

    const versions = [...chain.values()].sort(
      (a, b) =>
        (Number(b.version_number) || 0) - (Number(a.version_number) || 0) ||
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );

    return NextResponse.json({
      data: versions,
      current: versions.find((v) => v.is_current && !v.deleted_at) || null,
      count: versions.length,
    });
  } catch (e) {
    return apiError('file_versions', e);
  }
}
