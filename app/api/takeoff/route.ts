import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { ok, serverError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Query takeoffs without FK join to avoid PGRST200 errors
    let query = supabase
      .from('takeoffs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Look up project names separately to avoid FK resolution failures
    const rows = data || [];
    const projectIds = [...new Set(rows.map((t: Record<string, unknown>) => t.project_id).filter(Boolean))] as string[];
    let projectMap: Record<string, string> = {};

    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds);
      if (projects) {
        projectMap = Object.fromEntries(projects.map((p: { id: string; name: string }) => [p.id, p.name]));
      }
    }

    const takeoffs = rows.map((t: Record<string, unknown>) => ({
      ...t,
      project_name: (t.project_id && projectMap[t.project_id as string]) || null,
    }));

    return ok(takeoffs);
  } catch (err) {
    return serverError(err);
  }
}
