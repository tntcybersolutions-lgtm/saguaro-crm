import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ projects: [], source: 'unauth' }, { status: 401 });
    }
    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .select('*')
      .eq('tenant_id', user.tenantId)
      // Exclude soft-deleted / archived projects. Legacy rows have NULL flags,
      // so keep NULL (treated as not-archived) and drop only explicit `true`.
      .or('is_archived.is.null,is_archived.eq.false')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ projects: data || [], source: 'live' });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/list] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/list', e, 'Failed to load projects');
  }
}
