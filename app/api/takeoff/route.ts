import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { ok, serverError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    let query = supabase
      .from('takeoffs')
      .select('*, projects!takeoffs_project_id_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const takeoffs = (data || []).map((t: Record<string, unknown>) => {
      const projects = t.projects as { name?: string } | null;
      return {
        ...t,
        projects: undefined,
        project_name: projects?.name || null,
      };
    });

    return ok(takeoffs);
  } catch (err) {
    return serverError(err);
  }
}
