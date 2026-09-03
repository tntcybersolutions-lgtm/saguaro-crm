import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// GET /api/schedule/milestones/{projectId}  -> { milestones: [...] }
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ milestones: [] }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('schedule_milestones')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ milestones: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('schedule/milestones/projectId', e);
  }
}
