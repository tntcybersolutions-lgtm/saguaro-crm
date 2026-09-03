import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const module = url.searchParams.get('module') || '';
  const actionUser = url.searchParams.get('user') || '';
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    const supabase = createServerClient();
    let query = supabase
      .from('activity_log')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (module) query = query.eq('entity_type', module);
    if (actionUser) query = query.eq('user_name', actionUser);

    const { data, error } = await query;
    if (error) {
      console.error('[projects/[projectId]/activity] read failed:', error.message);
      return apiError('projects/projectId/activity', error, 'Failed to load activities');
    }
    return NextResponse.json({
      activities: data || [],
      hasMore: (data || []).length === limit,
      page,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/activity] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/activity', e, 'Failed to load activities');
  }
}
