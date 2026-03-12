import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * GET /api/rfis?projectId=&status=open&limit=3
 * Used by field home screen to show open RFI count + titles.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const status    = searchParams.get('status');
  const limit     = parseInt(searchParams.get('limit') || '50');
  const today     = new Date().toISOString().split('T')[0];

  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ rfis: [] }, { status: 401 });

    const db = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db
      .from('rfis')
      .select('id, rfi_number, subject, status, due_date, created_at')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (projectId) query = query.eq('project_id', projectId);
    if (status)    query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const rfis = (data || []).map((r: Record<string, unknown>) => ({
      ...r,
      is_overdue: r.status === 'open' && r.due_date && (r.due_date as string) < today,
    }));

    return NextResponse.json({ rfis });
  } catch {
    return NextResponse.json({ rfis: [] });
  }
}
